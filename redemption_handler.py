
import time
import queue
import threading
from typing import Dict, Any, List
from PyQt6.QtCore import QThread, pyqtSignal, QObject
from constants import bot_logger

class RedemptionHandler(QThread):
    """
    Handles the processing of channel point redemptions.
    Executes mapped OBS actions and updates redemption status on Twitch.
    Also periodically polls Twitch for new unfulfilled redemptions.
    """
    # Signals to update UI
    redemption_queued = pyqtSignal(dict)
    redemption_started = pyqtSignal(str) # redemption_id
    redemption_completed = pyqtSignal(str, bool) # redemption_id, success

    def __init__(self, reward_manager, obs_connector, twitch_api):
        super().__init__()
        self.reward_manager = reward_manager
        self.obs_connector = obs_connector
        self.twitch_api = twitch_api
        self.redemption_queue = queue.Queue()
        self.should_stop = False
        # Auto-fulfill should be opt-in. Read from config if available; default to False
        try:
            cfg = getattr(self.reward_manager, 'config', None)
            self.auto_fulfill = bool(cfg.get('auto_fulfill_redemptions', False)) if cfg else False
        except Exception:
            self.auto_fulfill = False
        bot_logger.info(f"RedemptionHandler: auto_fulfill set to {self.auto_fulfill}")
        # Poll interval in seconds for fetching redemptions
        self._poll_interval = 60
        self._last_poll = 0
        # Track redemptions we've already queued to avoid duplicates
        self._seen_redemptions = set()
        # Local in-memory cache of pending redemptions (id -> redemption dict)
        self._cached_redemptions = {}
        # Load persisted cache from config (if available)
        try:
            self._load_cached_redemptions()
        except Exception as e:
            bot_logger.error(f"Failed to load cached redemptions: {e}")
    def add_redemption(self, redemption_data: Dict[str, Any]):
        """Add a redemption to the processing queue and persist to cache.
        Normalize incoming redemption payloads so UI formatting has a consistent
        shape (ensure `user.display_name` and `reward.title` whenever possible).
        """
        # Defensive normalization
        try:
            # Ensure we have a dict copy so callers won't mutate shared objects
            red = dict(redemption_data)
            # Normalize user into a dict with display_name if only top-level fields exist
            user = red.get('user')
            if not user or not isinstance(user, dict):
                uname = red.get('user_name') or red.get('user_login') or None
                uid = red.get('user_id') or red.get('userId') or None
                if uname or uid:
                    red['user'] = {'display_name': uname or uid}
            else:
                # If user object exists but lacks display_name, try other keys
                if not user.get('display_name'):
                    user['display_name'] = user.get('login') or user.get('name') or red.get('user_name')
                    red['user'] = user
            # Normalize reward into dict with title when possible
            reward = red.get('reward')
            if not reward or not isinstance(reward, dict):
                # Some payloads might use reward_id or rewardId
                rid = red.get('reward_id') or red.get('rewardId')
                if rid:
                    red['reward'] = {'id': rid}
            else:
                if not reward.get('title'):
                    # Try to fill from reward_manager cache
                    rid = reward.get('id')
                    if rid and getattr(self, 'reward_manager', None):
                        try:
                            r = self.reward_manager.get_reward_by_id(rid)
                            if r:
                                reward['title'] = r.title
                                red['reward'] = reward
                        except Exception:
                            pass
            redemption_data = red
        except Exception as e:
            bot_logger.debug(f"Failed to normalize redemption payload: {e}")
        redemption_id = redemption_data.get('id')
        if not redemption_id:
            # Nothing to track; still put into queue so user can see it
            self.redemption_queue.put(redemption_data)
            self.redemption_queued.emit(redemption_data)
            return
        if redemption_id in self._seen_redemptions:
            bot_logger.debug(f"Redemption {redemption_id} already seen; skipping enqueue")
            return
        # Mark as seen to avoid duplicate enqueueing
        self._seen_redemptions.add(redemption_id)
        # Cache the redemption for UI persistence across restarts
        try:
            self._cached_redemptions[redemption_id] = redemption_data
            self._save_cached_redemptions()
        except Exception as e:
            bot_logger.error(f"Failed to save redemption to cache: {e}")
        # Enqueue for processing and notify UI
        self.redemption_queue.put(redemption_data)
        self.redemption_queued.emit(redemption_data)
        bot_logger.info(f"Queued redemption for reward: {redemption_data.get('reward', {}).get('title')}")

    def run(self):
        """Main processing loop"""
        bot_logger.info("RedemptionHandler thread started")
        while not self.should_stop:
            try:
                now = time.time()
                # Periodic polling for new redemptions
                if now - self._last_poll >= self._poll_interval:
                    try:
                        self._poll_for_new_redemptions()
                    except Exception as e:
                        bot_logger.error(f"Error polling for redemptions: {e}")
                    self._last_poll = now
                # Get next redemption (blocking with timeout to allow checking should_stop)
                try:
                    redemption = self.redemption_queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                self._process_redemption(redemption)
                self.redemption_queue.task_done()
            except Exception as e:
                bot_logger.error(f"Error in redemption handler loop: {e}")
        bot_logger.info("RedemptionHandler thread stopped")

    def stop(self):
        self.should_stop = True
        self.wait()

    def set_obs_connector(self, obs_connector):
        """Set or update the OBS connector instance used to execute actions."""
        self.obs_connector = obs_connector

    def _process_redemption(self, redemption):
        """Process a single redemption"""
        if not isinstance(redemption, dict):
            bot_logger.warning("Received invalid redemption object; skipping processing")
            return
        redemption_id = redemption.get('id')
        reward_data = redemption.get('reward', {}) or {}
        reward_id = reward_data.get('id')
        user_name = redemption.get('user', {}).get('display_name') or redemption.get('user_name')
        bot_logger.info(f"Processing redemption {redemption_id} for reward {reward_id} by {user_name}")
        # If identifiers are missing, don't attempt to auto-fulfill or update Twitch.
        if not redemption_id or not reward_id:
            bot_logger.warning(f"Skipping redemption processing due to missing id(s): redemption_id={redemption_id}, reward_id={reward_id}")
            # Still emit started/completed to allow UI to reflect state but do not modify remote state
            try:
                if redemption_id:
                    self.redemption_started.emit(redemption_id)
            except Exception:
                pass
            try:
                self.redemption_completed.emit(redemption_id, False)
            except Exception:
                pass
            return
        self.redemption_started.emit(redemption_id)
        # Get actions for this reward
        actions = self.reward_manager.get_actions_for_reward(reward_id)
        success = True
        if actions:
            try:
                self._execute_actions(actions, redemption)
            except Exception as e:
                bot_logger.error(f"Failed to execute actions for redemption {redemption_id}: {e}")
                success = False
        else:
            bot_logger.info(f"No actions mapped for reward {reward_id}")
        # Update status on Twitch if auto-fulfill is enabled and data is valid
        if self.auto_fulfill:
            try:
                status = 'FULFILLED' if success else 'CANCELED'
                bot_logger.info(f"Auto-fulfill enabled, attempting to update redemption {redemption_id} to {status}")
                self.twitch_api.update_redemption_status(reward_id, redemption_id, status)
                bot_logger.info(f"Marked redemption {redemption_id} as {status}")
                # Remove from seen set and cache so it no longer appears in UI
                try:
                    self._seen_redemptions.discard(redemption_id)
                except Exception:
                    pass
                try:
                    if redemption_id in self._cached_redemptions:
                        del self._cached_redemptions[redemption_id]
                        self._save_cached_redemptions()
                except Exception as e:
                    bot_logger.error(f"Failed to remove redemption from cache: {e}")
            except Exception as e:
                bot_logger.error(f"Failed to update redemption status on Twitch: {e}")
        self.redemption_completed.emit(redemption_id, success)

    def _execute_actions(self, actions: List[Dict], redemption_context: Dict):
        """Execute a sequence of OBS actions"""
        # Inject redemption context into actions if supported (e.g. text sources)
        # Context: user, input, reward title, etc.
        for action in actions:
            # Deep copy to avoid modifying config
            action_data = action.copy()
            # Simple context replacement for string values
            # E.g. replace %user% with user name
            user_name = redemption_context.get('user_name') or redemption_context.get('user', {}).get('display_name') or "User"
            user_input = redemption_context.get('user_input', '')
            self._apply_context(action_data, {'user': user_name, 'input': user_input})
            # Special actions management
            action_type = action_data.get('action')
            if action_type == 'wait':
                duration = float(action_data.get('duration', 0))
                time.sleep(duration)
                continue
            if self.obs_connector:
                self.obs_connector.action_requested.emit(action_data)
            else:
                bot_logger.warning("No OBS connector available to execute action")

    def _apply_context(self, data, context):
        """Recursively replace placeholders in action data"""
        if isinstance(data, dict):
            for k, v in data.items():
                data[k] = self._apply_context(v, context)
        elif isinstance(data, list):
            return [self._apply_context(i, context) for i in data]
        elif isinstance(data, str):
            for ck, cv in context.items():
                if f"%{ck}%" in data:
                    data = data.replace(f"%{ck}%", str(cv))
            return data
        return data

    def _poll_for_new_redemptions(self):
        """Poll Twitch for unfulfilled redemptions for managed rewards and enqueue them."""
        if not self.twitch_api or not self.reward_manager:
            bot_logger.debug("Redemption poll skipped: missing twitch_api or reward_manager")
            return
        try:
            reward_ids = list(self.reward_manager.rewards.keys())
            bot_logger.info(f"Redemption poll: checking {len(reward_ids)} rewards")
            # If we have no cached rewards, attempt to refresh once so we can map titles
            if not reward_ids:
                try:
                    bot_logger.info("Redemption poll: no cached rewards, attempting Channel Points refresh via RewardManager")
                    new_rewards = self.reward_manager.refresh_rewards()
                    reward_ids = list(self.reward_manager.rewards.keys())
                    bot_logger.info(f"Redemption poll: refresh returned {len(new_rewards)} rewards")
                except Exception as e:
                    bot_logger.error(f"Redemption poll: failed to refresh rewards: {e}")
                    return
            for reward_id in reward_ids:
                try:
                    redemptions = self.twitch_api.get_reward_redemptions(reward_id, status='UNFULFILLED', first=50, sort='NEWEST')
                    bot_logger.info(f"Redemption poll: reward {reward_id} returned {len(redemptions)} redemptions")
                    for r in redemptions:
                        rid = r.get('id')
                        if not rid:
                            continue
                        if rid in self._seen_redemptions:
                            continue
                        # Ensure redemption contains basic reward metadata so UI can display title
                        if 'reward' not in r or not r.get('reward'):
                            r['reward'] = {'id': reward_id}
                        if not r['reward'].get('title') and reward_id in self.reward_manager.rewards:
                            try:
                                r['reward']['title'] = self.reward_manager.rewards[reward_id].title
                            except Exception:
                                pass
                                bot_logger.info(f"New redemption detected for reward {reward_id}: {rid}")
                        self.add_redemption(r)
                        # Cache was updated in add_redemption
                    # Persist cache state periodically to avoid excessive writes
                    try:
                        self._save_cached_redemptions()
                    except Exception:
                        pass
                except Exception as e:
                    bot_logger.error(f"Failed to fetch redemptions for reward {reward_id}: {e}")
        except Exception as e:
            bot_logger.error(f"Error in _poll_for_new_redemptions: {e}")

    def _save_cached_redemptions(self):
        """Persist the in-memory cached redemptions and seen set to the app config."""
        try:
            cfg = None
            if self.reward_manager and getattr(self.reward_manager, 'config', None):
                cfg = self.reward_manager.config
            if not cfg:
                bot_logger.debug("No config available to save cached redemptions")
                return
            data = {
                'pending': self._cached_redemptions,
                'seen': list(self._seen_redemptions)
            }
            cfg.set('redemptions', data)
            bot_logger.debug(f"Saved {len(self._cached_redemptions)} cached redemptions to config")
        except Exception as e:
            bot_logger.error(f"Failed to save cached redemptions to config: {e}")

    def _load_cached_redemptions(self):
        """Load cached redemptions from config into memory and enqueue them for processing."""
        try:
            cfg = None
            if self.reward_manager and getattr(self.reward_manager, 'config', None):
                cfg = self.reward_manager.config
            if not cfg:
                bot_logger.debug("No config available to load cached redemptions")
                return
            data = cfg.get('redemptions', {}) or {}
            pending = data.get('pending', {}) or {}
            seen = set(data.get('seen', []) or [])
            self._seen_redemptions.update(seen)
            # Restore cached redemptions and enqueue them for processing
            for rid, red in pending.items():
                # Always restore cached redemption into memory
                self._cached_redemptions[rid] = red
                # Ensure it is enqueued for processing
                try:
                    self.redemption_queue.put(red)
                except Exception:
                    pass
                # Mark as seen so we don't double-process
                self._seen_redemptions.add(rid)
            bot_logger.info(f"Loaded {len(self._cached_redemptions)} cached redemptions from config")
        except Exception as e:
            bot_logger.error(f"Failed to load cached redemptions from config: {e}")

    def get_cached_redemptions(self):
        """Return a shallow list of cached pending redemptions for UI display."""
        return list(self._cached_redemptions.values())

    def trigger_poll(self):
        """Public method to trigger an immediate poll for new redemptions."""
        try:
            self._poll_for_new_redemptions()
        except Exception as e:
            bot_logger.error(f"Error triggering immediate redemption poll: {e}")

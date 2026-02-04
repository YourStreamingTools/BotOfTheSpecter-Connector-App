
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
        self.auto_fulfill = True # Configurable setting?
        # Poll interval in seconds for fetching redemptions
        self._poll_interval = 60
        self._last_poll = 0
        # Track redemptions we've already queued to avoid duplicates
        self._seen_redemptions = set()
    def add_redemption(self, redemption_data: Dict[str, Any]):
        """Add a redemption to the processing queue"""
        redemption_id = redemption_data.get('id')
        if redemption_id:
            # Mark as seen to avoid duplicate enqueueing
            self._seen_redemptions.add(redemption_id)
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
        redemption_id = redemption.get('id')
        reward_data = redemption.get('reward', {})
        reward_id = reward_data.get('id')
        user_name = redemption.get('user', {}).get('display_name') or redemption.get('user_name')
        bot_logger.info(f"Processing redemption {redemption_id} for reward {reward_id} by {user_name}")
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
        # Update status on Twitch if auto-fulfill is enabled
        if self.auto_fulfill:
            try:
                status = 'FULFILLED' if success else 'CANCELED'
                self.twitch_api.update_redemption_status(reward_id, redemption_id, status)
                bot_logger.info(f"Marked redemption {redemption_id} as {status}")
                # Once updated, remove from seen set so future polls may re-query if needed
                try:
                    self._seen_redemptions.discard(redemption_id)
                except Exception:
                    pass
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
            return
        try:
            for reward_id in list(self.reward_manager.rewards.keys()):
                try:
                    redemptions = self.twitch_api.get_reward_redemptions(reward_id, status='UNFULFILLED', first=50, sort='NEWEST')
                    for r in redemptions:
                        rid = r.get('id')
                        if not rid:
                            continue
                        if rid in self._seen_redemptions:
                            continue
                        bot_logger.info(f"New redemption detected for reward {reward_id}: {rid}")
                        self.add_redemption(r)
                except Exception as e:
                    bot_logger.error(f"Failed to fetch redemptions for reward {reward_id}: {e}")
        except Exception as e:
            bot_logger.error(f"Error in _poll_for_new_redemptions: {e}")


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

    def set_obs_connector(self, obs_connector):
        self.obs_connector = obs_connector
        
    def add_redemption(self, redemption_data: Dict[str, Any]):
        """Add a redemption to the processing queue"""
        self.redemption_queue.put(redemption_data)
        self.redemption_queued.emit(redemption_data)
        bot_logger.info(f"Queued redemption for reward: {redemption_data.get('reward', {}).get('title')}")

    def run(self):
        """Main processing loop"""
        bot_logger.info("RedemptionHandler thread started")
        while not self.should_stop:
            try:
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
                # Note: Currently we might not want to auto-cancel on failure, 
                # maybe just leave as UNFULFILLED for manual review?
                # For now let's auto-fulfill if defined actions ran, or if no actions defined (just tracking)
                
                # If "skip request queue" is on in reward settings, Twitch auto-fulfills. 
                # But we can still send FULFILLED to be sure or clean up.
                # Checking local reward config could tell us if we need to call API.
                
                self.twitch_api.update_redemption_status(reward_id, redemption_id, 'FULFILLED')
                bot_logger.info(f"Marked redemption {redemption_id} as FULFILLED")
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
                
            # Send to OBS connector
            # Since we are in a thread, we should emit a signal or queue it. 
            # OBSConnector expects execution on its thread or via signal 'action_requested'
            # But 'action_requested' is a signal on OBSConnector... we can emit to it?
            # Or better, if we have the instance, we can call a thread-safe method 
            # or emit a signal connected to it. 
            # OBSConnector.perform_action is main thread logic usually.
            # Best pattern: emit to obs_connector.action_requested
            
            if self.obs_connector:
                 # We emit the action_requested signal. OBSConnector connects this to _handle_action_request
                 # BUT signals are instance attributes. We need to emit the signal ON the obs_connector?
                 # Signals are defined on the class. To emit, we typically do `self.signal.emit()`.
                 # We cannot emit `obs_connector.action_requested.emit()` from here if we are not the owner (?)
                 # Actually strictly speaking, anyone can emit a signal if they have the object.
                 # Let's try emitting directly if we can't find a better way.
                 # Alternatively, define our own signal and connect it in main.
                 # Let's emit directly for now, standard PyQt/Pyside allows this.
                 
                 self.obs_connector.action_requested.emit(action_data)
                 
                 # Note: action_requested is async. If we need to wait for it to finish before next action
                 # (like wait), we might have a race condition.
                 # However, OBSConnector processes actions sequentially in its event loop?
                 # No, OBSConnector acts on signals. 
                 # If we emit 3 actions, they go into the Qt event queue. 
                 # The 'wait' action here (time.sleep) pauses THIS thread, holding back the emission of the next action.
                 # So timing is preserved! 
                 
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

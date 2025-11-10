import asyncio
import random
from datetime import datetime
from PyQt6.QtCore import QThread, pyqtSignal
import socketio
from constants import (
    API_TOKEN, CHANNEL_NAME, VERSION, SPECTER_WEBSOCKET_URI,
    RECONNECT_DELAY, CONNECTION_TIMEOUT, JITTER_RANGE,
    websocket_logger, bot_logger, redact_sensitive_data
)

# Global variables
websocket_connected = False
specterSocket = socketio.AsyncClient()

class BotOfTheSpecterConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)

    def __init__(self, api_key, obs_connector=None, main_window=None):
        super().__init__()
        global API_TOKEN, specterSocket
        API_TOKEN = api_key
        self.api_key = api_key
        self.obs_connector = obs_connector
        self.main_window = main_window  # Reference to main window to check lock state
        self.should_stop = False
        specterSocket = socketio.AsyncClient()
        self.setup_events()

    def set_obs_connector(self, obs_connector):
        self.obs_connector = obs_connector

    def _parse_obs_event(self, data):
        subcommand = data.get('subcommand', '').lower()
        if subcommand == 'scene':
            scene_name = data.get('scene_name')
            if not scene_name:
                raise ValueError("scene_name is required for scene subcommand")
            return {
                'action': 'set_current_program_scene',
                'scene': scene_name
            }
        elif subcommand == 'source':
            scene_name = data.get('scene_name')
            item_id = data.get('source_id') or data.get('item_id')
            enabled = data.get('enabled', True)
            if not scene_name or item_id is None:
                raise ValueError("scene_name and item_id/source_id are required for source subcommand")
            return {
                'action': 'set_scene_item_enabled',
                'scene': scene_name,
                'item_id': item_id,
                'enabled': enabled
            }
        else:
            raise ValueError(f"Unknown subcommand: {subcommand}")

    def setup_events(self):
        global specterSocket

        @specterSocket.event
        async def connect():
            global websocket_connected
            websocket_logger.info("WebSocket connection established, attempting registration...")
            websocket_logger.info(f"Session ID: {specterSocket.sid}")
            websocket_logger.info(f"Transport: {specterSocket.transport()}")
            registration_data = {
                'code': API_TOKEN,
                'channel': CHANNEL_NAME,
                'name': f'Connector V{VERSION}'
            }
            safe_reg_data = registration_data.copy()
            safe_reg_data['code'] = '***REDACTED***'
            websocket_logger.info(f"Sending registration: {safe_reg_data}")
            try:
                await specterSocket.emit('REGISTER', registration_data)
                websocket_logger.info("Client registration sent successfully")
                websocket_connected = True
                websocket_logger.info("Successfully registered with Specter websocket server")
                self.status_update.emit("Connected to BotOfTheSpecter")
            except Exception as e:
                websocket_logger.error(f"Failed to register client: {e}")
                websocket_connected = False
                try:
                    await specterSocket.disconnect()
                except Exception:
                    pass

        @specterSocket.event
        async def connect_error(data):
            global websocket_connected
            websocket_connected = False
            websocket_logger.error(f"WebSocket connection error: {data}")
            websocket_logger.info("Connection will be retried automatically")

        @specterSocket.event
        async def disconnect():
            global websocket_connected
            websocket_connected = False
            websocket_logger.warning("Client disconnected from internal websocket server")
            websocket_logger.info("WebSocket will attempt to reconnect automatically")
            self.status_update.emit("Disconnected from BotOfTheSpecter")

        @specterSocket.event
        async def message(data):
            safe_data = redact_sensitive_data(data) if isinstance(data, dict) else data
            websocket_logger.info(f"Message event received: {safe_data}")
            try:
                if isinstance(data, dict):
                    if 'action' in data and self.obs_connector:
                        self.obs_connector.perform_action(data)
                        message_text = f"Executed action: {data}"
                    else:
                        message_text = f"Event: {data.get('type', 'unknown')} - {redact_sensitive_data(data)}"
                else:
                    message_text = f"Message: {data}"
                websocket_logger.info(f"About to emit to GUI: {message_text}")
                self.event_received.emit(message_text)
                websocket_logger.info(f"Successfully emitted to GUI")
            except Exception as e:
                websocket_logger.error(f"Error processing message: {e}")
                self.event_received.emit(f"Error processing message: {e}")

        @specterSocket.on('*')
        async def catch_all(event, data):
            safe_data = redact_sensitive_data(data) if isinstance(data, dict) else data
            websocket_logger.info(f"Received event '{event}': {safe_data}")
            if event == 'OBS_EVENT':
                return
            message = None
            if event == 'SEND_OBS_EVENT':
                message = None
            elif event == 'WELCOME':
                message = "✅ Specter Connected"
            elif event == 'SUCCESS':
                message = "✅ Specter Registered successfully"
            else:
                if isinstance(data, dict):
                    safe_data_display = redact_sensitive_data(data)
                    log_data = safe_data_display
                else:
                    log_data = data
                message = f"Event '{event}': {log_data}"
            if message:
                self.event_received.emit(message)
            if event in ('SEND_OBS_EVENT', 'OBS_REQUEST'):
                if isinstance(data, dict) and self.obs_connector:
                    try:
                        if 'action' not in data and 'subcommand' in data:
                            action_data = self._parse_obs_event(data)
                        else:
                            action_data = data
                        websocket_logger.info(f"Executing OBS action: {action_data}")
                        self.obs_connector.perform_action(action_data)
                        if specterSocket.connected:
                            await specterSocket.emit('OBS_EVENT_RECEIVED', {
                                'code': API_TOKEN,
                                'status': 'success',
                                'action': action_data,
                                'message': 'Action completed successfully'
                            })
                            self.event_received.emit(f"✓ OBS Action Completed: {action_data.get('action', 'unknown')}")
                            websocket_logger.info(f"OBS_EVENT_RECEIVED acknowledgment sent")
                        else:
                            websocket_logger.warning(f"Socket not connected, could not send acknowledgment for action: {action_data}")
                    except Exception as e:
                        websocket_logger.error(f"Failed to execute OBS action: {e}", exc_info=True)
                        try:
                            if specterSocket.connected:
                                await specterSocket.emit('OBS_EVENT_RECEIVED', {
                                    'code': API_TOKEN,
                                    'status': 'error',
                                    'message': str(e),
                                    'action': data
                                })
                            self.event_received.emit(f"✗ OBS Action Failed: {str(e)}")
                        except Exception as emit_error:
                            websocket_logger.error(f"Failed to emit error acknowledgment: {emit_error}")
                else:
                    websocket_logger.warning("Received OBS request but cannot execute (no connector or invalid data)")
                    try:
                        if specterSocket.connected:
                            await specterSocket.emit('OBS_EVENT_RECEIVED', {
                                'code': API_TOKEN,
                                'status': 'error',
                                'message': 'Invalid data or no OBS connection'
                            })
                        self.event_received.emit("✗ OBS Action Error: Invalid data or no OBS connection")
                    except Exception as emit_error:
                        websocket_logger.error(f"Failed to emit error acknowledgment: {emit_error}")
            else:
                obs_notification_events = [
                    "scene_change", "SceneChanged", "scene_created", "SceneCreated",
                    "scene_removed", "SceneRemoved",
                    "source_created", "SourceCreated", "source_removed", "SourceRemoved",
                    "source_visibility_changed", "SourceVisibilityChanged",
                    "source_muted", "SourceMuteStateChanged", "source_unmuted",
                    "record_state_changed", "RecordStateChanged", "recording_started", "RecordingStarted",
                    "recording_stopped", "RecordingStopped",
                    "stream_state_changed", "StreamStateChanged", "streaming_started", "StreamStarted",
                    "streaming_stopped", "StreamStopped",
                    "source_filter_created", "SourceFilterCreated", "source_filter_removed", "SourceFilterRemoved",
                    "source_filter_enabled_state_changed", "SourceFilterEnableStateChanged",
                    "virtualcam_state_changed", "VirtualcamStateChanged",
                    "transition_began", "TransitionBegan", "transition_ended", "TransitionEnded",
                ]
                for ev_name in obs_notification_events:
                    @specterSocket.on(ev_name)
                    async def _make_handler(data, _ev=ev_name):
                        websocket_logger.info(f"Received OBS notification '{_ev}': {data}")
                        self.event_received.emit(f"OBS Notification '{_ev}': {data}")
                        if self.obs_connector:
                            try:
                                self.obs_connector.handle_specter_event(_ev, data)
                            except Exception as e:
                                websocket_logger.error(f"Error forwarding '{_ev}' to OBSConnector: {e}")

        @specterSocket.on('OBS_REQUEST')
        async def handle_obs_request(data):
            websocket_logger.info(f"OBS_REQUEST received: {data}")
            # Check if control panel is locked
            if self.main_window and self.main_window.is_locked:
                websocket_logger.warning(f"OBS_REQUEST blocked: Control panel is LOCKED")
                self.event_received.emit(f"🔒 OBS Request BLOCKED: Control panel is locked")
                try:
                    if specterSocket.connected:
                        await specterSocket.emit('OBS_EVENT_RECEIVED', {
                            'code': API_TOKEN,
                            'status': 'blocked',
                            'message': 'Control panel is locked - commands ignored',
                            'action': data
                        })
                except Exception as emit_error:
                    websocket_logger.error(f"Failed to emit blocked acknowledgment: {emit_error}")
                return
            if isinstance(data, dict) and self.obs_connector:
                try:
                    if 'action' not in data and 'subcommand' in data:
                        action_data = self._parse_obs_event(data)
                    else:
                        action_data = data
                    websocket_logger.info(f"Executing OBS_REQUEST action: {action_data}")
                    self.obs_connector.perform_action(action_data)
                    if specterSocket.connected:
                        await specterSocket.emit('OBS_EVENT_RECEIVED', {
                            'code': API_TOKEN,
                            'status': 'success',
                            'action': action_data,
                            'message': 'Action completed successfully'
                        })
                        self.event_received.emit(f"✓ OBS Request Completed: {action_data.get('action', 'unknown')}")
                        websocket_logger.info(f"OBS_EVENT_RECEIVED acknowledgment sent for OBS_REQUEST")
                    else:
                        websocket_logger.warning(f"Socket not connected, could not send acknowledgment for OBS_REQUEST")
                except Exception as e:
                    websocket_logger.error(f"Failed to execute OBS_REQUEST: {e}", exc_info=True)
                    try:
                        if specterSocket.connected:
                            await specterSocket.emit('OBS_EVENT_RECEIVED', {
                                'code': API_TOKEN,
                                'status': 'error',
                                'message': str(e),
                                'action': data
                            })
                        self.event_received.emit(f"✗ OBS Request Failed: {str(e)}")
                    except Exception as emit_error:
                        websocket_logger.error(f"Failed to emit error acknowledgment: {emit_error}")
            else:
                websocket_logger.warning("Received OBS_REQUEST but cannot execute (no connector or invalid data)")
                try:
                    if specterSocket.connected:
                        await specterSocket.emit('OBS_EVENT_RECEIVED', {
                            'code': API_TOKEN,
                            'status': 'error',
                            'message': 'Invalid data or no OBS connection'
                        })
                    self.event_received.emit("✗ OBS Request Error: Invalid data or no OBS connection")
                except Exception as emit_error:
                    websocket_logger.error(f"Failed to emit error acknowledgment: {emit_error}")

        @specterSocket.on('OBS_EVENT_RECEIVED')
        async def handle_obs_event_received(data):
            safe_data = data.copy()
            if 'code' in safe_data:
                safe_data['code'] = '***REDACTED***'
            websocket_logger.info(f"OBS_EVENT_RECEIVED: {safe_data}")

    def is_websocket_connected(self):
        global websocket_connected
        return websocket_connected

    async def force_websocket_reconnect(self):
        global websocket_connected, specterSocket
        try:
            if specterSocket and specterSocket.connected:
                websocket_logger.info("Forcing websocket disconnection for reconnection")
                await specterSocket.disconnect()
            websocket_connected = False
            return True
        except Exception as e:
            websocket_logger.error(f"Error during forced reconnection: {e}")
            return False

    def run(self):
        asyncio.run(self.specter_websocket())

    async def specter_websocket(self):
        global websocket_connected, specterSocket
        reconnect_delay = RECONNECT_DELAY
        consecutive_failures = 0
        while not self.should_stop:
            try:
                websocket_connected = False
                if specterSocket and specterSocket.connected:
                    try:
                        await specterSocket.disconnect()
                        websocket_logger.info("Disconnected existing WebSocket connection before reconnection attempt")
                    except Exception as disconnect_error:
                        websocket_logger.warning(f"Error disconnecting existing connection: {disconnect_error}")
                if consecutive_failures > 0:
                    jitter = random.uniform(*JITTER_RANGE)
                    total_delay = reconnect_delay + jitter
                    websocket_logger.info(f"Reconnection attempt {consecutive_failures}, waiting {total_delay:.1f} seconds")
                    await asyncio.sleep(total_delay)
                bot_logger.info(f"Attempting to connect to Internal WebSocket Server (attempt {consecutive_failures + 1})")
                await specterSocket.connect(SPECTER_WEBSOCKET_URI, transports=['websocket'])
                connection_timeout = CONNECTION_TIMEOUT
                start_time = datetime.now()
                while not websocket_connected:
                    if (datetime.now() - start_time).total_seconds() > connection_timeout:
                        raise asyncio.TimeoutError("Connection establishment and registration timeout")
                    await asyncio.sleep(0.5)
                consecutive_failures = 0
                websocket_logger.info("Successfully connected and registered with Internal WebSocket Server")
                websocket_logger.info(f"Connected with session ID: {specterSocket.sid}")
                websocket_logger.info(f"Transport method: {specterSocket.transport()}")
                await specterSocket.wait()
            except ConnectionError as e:
                consecutive_failures += 1
                websocket_connected = False
                websocket_logger.error(f"Internal WebSocket Connection Failed (attempt {consecutive_failures}): {e}")
            except asyncio.TimeoutError as e:
                consecutive_failures += 1
                websocket_connected = False
                websocket_logger.error(f"Internal WebSocket Connection Timeout (attempt {consecutive_failures}): {e}")
            except Exception as e:
                consecutive_failures += 1
                websocket_connected = False
                websocket_logger.error(f"Unexpected error with Internal WebSocket (attempt {consecutive_failures}): {e}")
            websocket_connected = False
            websocket_logger.warning(f"WebSocket connection lost, preparing for reconnection attempt {consecutive_failures + 1}")
            await asyncio.sleep(1)
        websocket_connected = False
        websocket_logger.info("WebSocket connection loop stopped")

    def disconnect(self):
        self.should_stop = True

    def send_event(self, event_type, data):
        if self.is_websocket_connected():
            asyncio.run(specterSocket.emit(event_type, data))
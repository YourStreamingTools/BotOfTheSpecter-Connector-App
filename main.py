import sys, json, os
import requests
import asyncio
import random
import logging
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox
)
from PyQt6.QtCore import QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QIcon
import socketio
import obswebsocket
from obswebsocket import requests as obs_requests

# Use appdata for config
APPDATA_DIR = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'BotOfTheSpecter-OBS-Connector')
os.makedirs(APPDATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(APPDATA_DIR, 'config.json')
LOG_FILE = os.path.join(APPDATA_DIR, 'app.log')
ICON_FILE = os.path.join(APPDATA_DIR, 'botofthespecter.png')

# Constants
API_TOKEN = None  # Will be set from config
CHANNEL_NAME = "OBS"
VERSION = "1.0"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
websocket_logger = logging.getLogger('websocket')
bot_logger = logging.getLogger('bot')

# Global variables
websocket_connected = False
specterSocket = socketio.AsyncClient()

def download_icon():
    if os.path.exists(ICON_FILE):
        return True
    try:
        response = requests.get("https://cdn.botofthespecter.com/logo.png")
        if response.status_code == 200:
            with open(ICON_FILE, 'wb') as f:
                f.write(response.content)
            return True
        else:
            print(f"Failed to download icon: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"Error downloading icon: {e}")
        return False

class Config:
    def __init__(self):
        self.data = {}
        self.load()

    def load(self):
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                self.data = json.load(f)

    def save(self):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(self.data, f, indent=4)

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value):
        self.data[key] = value
        self.save()

class BotOfTheSpecterConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)

    def __init__(self, api_key, obs_connector=None):
        super().__init__()
        global API_TOKEN, specterSocket
        API_TOKEN = api_key
        self.api_key = api_key
        self.obs_connector = obs_connector
        specterSocket = socketio.AsyncClient()
        self.setup_events()

    def set_obs_connector(self, obs_connector):
        self.obs_connector = obs_connector

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
            # Log registration data with redacted API key
            safe_reg_data = registration_data.copy()
            safe_reg_data['code'] = '***REDACTED***'
            websocket_logger.info(f"Sending registration: {safe_reg_data}")
            try:
                await specterSocket.emit('REGISTER', registration_data)
                websocket_logger.info("Client registration sent successfully")
                websocket_connected = True  # Set flag to true only after successful registration
                websocket_logger.info("Successfully registered with Specter websocket server")
                self.status_update.emit("Connected to BotOfTheSpecter")
            except Exception as e:
                websocket_logger.error(f"Failed to register client: {e}")
                websocket_connected = False  # Set flag to false if registration fails
                # Disconnect to trigger reconnection
                try:
                    await specterSocket.disconnect()
                except Exception:
                    pass

        @specterSocket.event
        async def connect_error(data):
            global websocket_connected
            websocket_connected = False  # Ensure flag is set to false on connection error
            websocket_logger.error(f"WebSocket connection error: {data}")
            websocket_logger.info("Connection will be retried automatically")

        @specterSocket.event
        async def disconnect():
            global websocket_connected
            websocket_connected = False  # Set flag to false when disconnected
            websocket_logger.warning("Client disconnected from internal websocket server")
            websocket_logger.info("WebSocket will attempt to reconnect automatically")
            self.status_update.emit("Disconnected from BotOfTheSpecter")

        @specterSocket.event
        async def message(data):
            websocket_logger.info(f"Message event received: {data}")
            try:
                # Handle different data types
                if isinstance(data, dict):
                    if 'action' in data and self.obs_connector:
                        self.obs_connector.perform_action(data)
                        message_text = f"Executed action: {data}"
                    else:
                        message_text = f"Event: {data.get('type', 'unknown')} - {data}"
                else:
                    message_text = f"Message: {data}"
                websocket_logger.info(f"About to emit to GUI: {message_text}")
                self.event_received.emit(message_text)
                websocket_logger.info(f"Successfully emitted to GUI")
            except Exception as e:
                websocket_logger.error(f"Error processing message: {e}")
                self.event_received.emit(f"Error processing message: {e}")

        # Catch-all event handler (keeps logging for any event not explicitly handled)
        @specterSocket.on('*')
        async def catch_all(event, data):
            # Redact sensitive information
            if isinstance(data, dict):
                safe_data = data.copy()
                if 'code' in safe_data:
                    safe_data['code'] = '***REDACTED***'
                log_data = safe_data
            else:
                log_data = data
            websocket_logger.info(f"Received event '{event}': {log_data}")
            self.event_received.emit(f"Event '{event}': {log_data}")
            # Legacy/compat: if an older name is used (SEND_OBS_EVENT) treat it as an OBS request
            if event in ('SEND_OBS_EVENT', 'OBS_REQUEST'):
                if isinstance(data, dict) and self.obs_connector:
                    try:
                        # data is expected to contain the action details
                        self.obs_connector.perform_action(data)
                        await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'success', 'action': data})
                        websocket_logger.info(f"Executed OBS action: {data}")
                    except Exception as e:
                        await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'error', 'message': str(e), 'action': data})
                        websocket_logger.error(f"Failed to execute OBS action: {e}")
                else:
                    await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'error', 'message': 'Invalid data or no OBS connection'})
                    websocket_logger.warning("Received OBS request but cannot execute")
            else:
                # Register explicit handlers for common OBS event notifications coming FROM the server
                obs_notification_events = [
                    # Scene events
                    "scene_change", "SceneChanged", "scene_created", "SceneCreated",
                    "scene_removed", "SceneRemoved",
                    # Source events
                    "source_created", "SourceCreated", "source_removed", "SourceRemoved",
                    "source_visibility_changed", "SourceVisibilityChanged",
                    "source_muted", "SourceMuteStateChanged", "source_unmuted",
                    # Recording events
                    "record_state_changed", "RecordStateChanged", "recording_started", "RecordingStarted",
                    "recording_stopped", "RecordingStopped",
                    # Streaming events
                    "stream_state_changed", "StreamStateChanged", "streaming_started", "StreamStarted",
                    "streaming_stopped", "StreamStopped",
                    # Filter events
                    "source_filter_created", "SourceFilterCreated", "source_filter_removed", "SourceFilterRemoved",
                    "source_filter_enabled_state_changed", "SourceFilterEnableStateChanged",
                    # Virtual camera events
                    "virtualcam_state_changed", "VirtualcamStateChanged",
                    # Transition events
                    "transition_began", "TransitionBegan", "transition_ended", "TransitionEnded",
                ]
                for ev_name in obs_notification_events:
                    # create a handler that captures ev_name
                    @specterSocket.on(ev_name)
                    async def _make_handler(data, _ev=ev_name):
                        websocket_logger.info(f"Received OBS notification '{_ev}': {data}")
                        # Show in GUI
                        self.event_received.emit(f"OBS Notification '{_ev}': {data}")
                        # Forward to OBS connector if available for any additional handling
                        if self.obs_connector:
                            try:
                                # allow OBSConnector to decide how to handle/format
                                self.obs_connector.handle_specter_event(_ev, data)
                            except Exception as e:
                                websocket_logger.error(f"Error forwarding '{_ev}' to OBSConnector: {e}")

        # Explicit handler for OBS_REQUEST (preferred event name for commands coming FROM Specter TO OBS)
        @specterSocket.on('OBS_REQUEST')
        async def handle_obs_request(data):
            websocket_logger.info(f"OBS_REQUEST received: {data}")
            self.event_received.emit(f"OBS_REQUEST: {data}")
            if isinstance(data, dict) and self.obs_connector:
                try:
                    self.obs_connector.perform_action(data)
                    await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'success', 'action': data})
                    websocket_logger.info(f"Executed OBS_REQUEST action: {data}")
                except Exception as e:
                    await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'error', 'message': str(e), 'action': data})
                    websocket_logger.error(f"Failed to execute OBS_REQUEST action: {e}")
            else:
                await specterSocket.emit('OBS_EVENT_RECEIVED', {'status': 'error', 'message': 'Invalid data or no OBS connection'})

        # Explicit handler for OBS_EVENT_RECEIVED (acknowledgements from Specter)
        @specterSocket.on('OBS_EVENT_RECEIVED')
        async def handle_obs_event_received(data):
            websocket_logger.info(f"OBS_EVENT_RECEIVED: {data}")
            # Show in GUI
            self.event_received.emit(f"OBS_EVENT_RECEIVED: {data}")

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

    # Connect and manage reconnection for Internal Socket Server
    async def specter_websocket(self):
        global websocket_connected, specterSocket
        specter_websocket_uri = "https://websocket.botofthespecter.com"
        # Reconnection parameters
        reconnect_delay = 60  # Fixed 60 second delay for each reconnection attempt
        consecutive_failures = 0
        while True:
            try:
                # Ensure clean state before connection attempt
                websocket_connected = False
                # Disconnect existing connection if any
                if specterSocket and specterSocket.connected:
                    try:
                        await specterSocket.disconnect()
                        websocket_logger.info("Disconnected existing WebSocket connection before reconnection attempt")
                    except Exception as disconnect_error:
                        websocket_logger.warning(f"Error disconnecting existing connection: {disconnect_error}")
                # Wait 60 seconds before each reconnection attempt (server takes min 2 mins to reboot)
                if consecutive_failures > 0:
                    # Add small jitter to prevent multiple instances from reconnecting simultaneously
                    jitter = random.uniform(0, 5)  # 0-5 second jitter
                    total_delay = reconnect_delay + jitter
                    websocket_logger.info(f"Reconnection attempt {consecutive_failures}, waiting {total_delay:.1f} seconds (server reboot consideration)")
                    await asyncio.sleep(total_delay)
                # Attempt to connect to the WebSocket server using websocket transport directly
                bot_logger.info(f"Attempting to connect to Internal WebSocket Server (attempt {consecutive_failures + 1})")
                await specterSocket.connect(specter_websocket_uri, transports=['websocket'])
                # Wait for connection to be established and registered
                connection_timeout = 30  # 30 second timeout for connection + registration
                start_time = datetime.now()
                while not websocket_connected:
                    if (datetime.now() - start_time).total_seconds() > connection_timeout:
                        raise asyncio.TimeoutError("Connection establishment and registration timeout")
                    await asyncio.sleep(0.5)
                # Reset failure counter on successful connection
                consecutive_failures = 0
                websocket_logger.info("Successfully connected and registered with Internal WebSocket Server")
                websocket_logger.info(f"Connected with session ID: {specterSocket.sid}")
                websocket_logger.info(f"Transport method: {specterSocket.transport()}")
                # Keep the connection alive and handle messages
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
            # Connection lost or failed, prepare for reconnection
            websocket_connected = False
            websocket_logger.warning(f"WebSocket connection lost, preparing for reconnection attempt {consecutive_failures + 1}")
            # Small delay before next iteration to prevent tight loop
            await asyncio.sleep(1)

    def disconnect(self):
        asyncio.run(self.force_websocket_reconnect())

    def send_event(self, event_type, data):
        if self.is_websocket_connected():
            asyncio.run(specterSocket.emit(event_type, data))

class OBSConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)

    def __init__(self, host, port, password, bot_connector):
        super().__init__()
        self.host = host
        self.port = port
        self.password = password
        self.bot_connector = bot_connector
        self.client = obswebsocket.obsws(host, port, password)
        self.connected = False

    def on_event(self, event):
        event_type = event.__class__.__name__
        data = event.__dict__.get('datain', event.__dict__)
        message = f"OBS Event: {event_type} - {data}"
        self.event_received.emit(message)
        # Forward event to BotOfTheSpecter
        if self.bot_connector:
            self.bot_connector.send_event('OBS_EVENT', {'type': event_type, 'data': data})

    def handle_specter_event(self, event_name, data):
        try:
            message = f"Specter -> OBS event '{event_name}': {data}"
            self.event_received.emit(message)
        except Exception as e:
            # Emit an error into the GUI
            self.event_received.emit(f"Error handling specter event '{event_name}': {e}")

    def run(self):
        try:
            self.client.connect()
            self.client.register(self.on_event)
            self.connected = True
            self.status_update.emit("Connected to OBS")
            # Keep the connection alive
            self.client.call(obs_requests.GetVersion())
        except Exception as e:
            self.status_update.emit(f"Failed to connect to OBS: {str(e)}")

    def disconnect(self):
        if self.connected:
            self.client.disconnect()
            self.connected = False
            self.status_update.emit("Disconnected from OBS")

    def perform_action(self, action):
        try:
            if action.get('action') == 'set_scene_item_enabled':
                req = obs_requests.SetSceneItemEnabled(
                    sceneName=action['scene'],
                    sceneItemId=action['item_id'],
                    sceneItemEnabled=action['enabled']
                )
                self.client.call(req)
                self.status_update.emit(f"Executed: {action}")
            elif action.get('action') == 'set_current_program_scene':
                req = obs_requests.SetCurrentProgramScene(sceneName=action['scene'])
                self.client.call(req)
                self.status_update.emit(f"Executed: {action}")
            else:
                self.status_update.emit(f"Unknown action: {action}")
        except Exception as e:
            self.status_update.emit(f"Failed to execute action: {e}")

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.config = Config()
        self.bot_connector = None
        self.obs_connector = None
        download_icon()
        self.init_ui()
        if os.path.exists(ICON_FILE):
            self.setWindowIcon(QIcon(ICON_FILE))

    def init_ui(self):
        self.setWindowTitle('BotOfTheSpecter - OBS Connector')
        self.setGeometry(300, 300, 600, 500)
        layout = QVBoxLayout()
        # BotOfTheSpecter Group
        bot_group = QGroupBox("BotOfTheSpecter Settings")
        bot_layout = QVBoxLayout()
        api_layout = QHBoxLayout()
        api_layout.addWidget(QLabel("API Key:"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        api_key = self.config.get('api_key', '')
        self.api_key_input.setText(api_key)
        api_layout.addWidget(self.api_key_input)
        self.validate_btn = QPushButton("Validate")
        self.validate_btn.clicked.connect(self.validate_api_key)
        api_layout.addWidget(self.validate_btn)
        bot_layout.addLayout(api_layout)
        self.bot_status = QLabel("Status: Not connected")
        bot_layout.addWidget(self.bot_status)
        self.bot_connect_btn = QPushButton("Connect")
        self.bot_connect_btn.clicked.connect(self.connect_bot)
        self.bot_connect_btn.setEnabled(False)
        bot_layout.addWidget(self.bot_connect_btn)
        bot_group.setLayout(bot_layout)
        layout.addWidget(bot_group)
        # OBS Group
        obs_group = QGroupBox("OBS WebSocket Settings")
        obs_layout = QVBoxLayout()
        obs_config_layout = QHBoxLayout()
        obs_config_layout.addWidget(QLabel("Host:"))
        self.obs_host = QLineEdit(self.config.get('obs_host', 'localhost'))
        obs_config_layout.addWidget(self.obs_host)
        obs_config_layout.addWidget(QLabel("Port:"))
        self.obs_port = QLineEdit(str(self.config.get('obs_port', 4455)))
        obs_config_layout.addWidget(self.obs_port)
        obs_config_layout.addWidget(QLabel("Password:"))
        self.obs_password = QLineEdit()
        self.obs_password.setEchoMode(QLineEdit.EchoMode.Password)
        self.obs_password.setText(self.config.get('obs_password', ''))
        obs_config_layout.addWidget(self.obs_password)
        obs_layout.addLayout(obs_config_layout)
        self.obs_status = QLabel("Status: Not connected")
        obs_layout.addWidget(self.obs_status)
        self.obs_connect_btn = QPushButton("Connect")
        self.obs_connect_btn.clicked.connect(self.connect_obs)
        obs_layout.addWidget(self.obs_connect_btn)
        obs_group.setLayout(obs_layout)
        layout.addWidget(obs_group)
        # Log Area
        log_group = QGroupBox("Event Log")
        log_layout = QVBoxLayout()
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        log_layout.addWidget(self.log_area)
        log_group.setLayout(log_layout)
        layout.addWidget(log_group)
        self.setLayout(layout)
        # Auto-connect if API key exists
        if api_key:
            self.bot_connect_btn.setEnabled(True)
            self.connect_bot()
        # Auto-connect to OBS if settings exist
        obs_host = self.config.get('obs_host')
        obs_port = self.config.get('obs_port')
        obs_password = self.config.get('obs_password')
        if obs_host and obs_port and obs_password:
            self.connect_obs()

    def validate_api_key(self):
        api_key = self.api_key_input.text()
        if not api_key:
            QMessageBox.warning(self, "Validation", "Please enter an API key.")
            return
        # For now, just accept any non-empty key and let WebSocket connection validate it
        QMessageBox.information(self, "Validation", "API Key accepted. Connection will be validated when connecting.")
        self.config.set('api_key', api_key)
        self.bot_connect_btn.setEnabled(True)

    def connect_bot(self):
        if self.bot_connector and self.bot_connector.isRunning():
            asyncio.run(self.bot_connector.force_websocket_reconnect())
            self.bot_connect_btn.setText("Connect")
            return
        api_key = self.api_key_input.text()
        self.bot_connector = BotOfTheSpecterConnector(api_key, self.obs_connector)
        self.bot_connector.status_update.connect(self.update_bot_status)
        self.bot_connector.event_received.connect(self.log_event)
        self.bot_connector.start()
        self.bot_connect_btn.setText("Disconnect")

    def connect_obs(self):
        if self.obs_connector and self.obs_connector.isRunning():
            self.obs_connector.disconnect()
            self.obs_connect_btn.setText("Connect")
            return
        host = self.obs_host.text()
        port = int(self.obs_port.text())
        password = self.obs_password.text()
        self.config.set('obs_host', host)
        self.config.set('obs_port', port)
        self.config.set('obs_password', password)
        self.obs_connector = OBSConnector(host, port, password, self.bot_connector)
        if self.bot_connector:
            self.bot_connector.set_obs_connector(self.obs_connector)
        self.obs_connector.status_update.connect(self.update_obs_status)
        self.obs_connector.event_received.connect(self.log_event)
        self.obs_connector.start()
        self.obs_connect_btn.setText("Disconnect")

    def update_bot_status(self, status):
        self.bot_status.setText(f"Status: {status}")

    def update_obs_status(self, status):
        self.obs_status.setText(f"Status: {status}")

    def log_event(self, event):
        self.log_area.append(event)

    def test_event_log(self):
        self.log_event("Test event - Event log is working!")

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
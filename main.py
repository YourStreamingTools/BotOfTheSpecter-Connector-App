import sys
import os
import configparser
import aiohttp
import asyncio
import json
import logging
from datetime import datetime
from PyQt5.QtCore import Qt, pyqtSignal, QThread
from PyQt5.QtWidgets import (
    QWidget, QApplication, QMainWindow, QPushButton, QVBoxLayout, QFormLayout,
    QLineEdit, QLabel, QStackedWidget, QHBoxLayout, QAction, QMessageBox, QTextEdit
)
from PyQt5.QtGui import QIcon, QColor, QTextCursor
import socketio
from socketio import AsyncClient as SocketClient
import obswebsocket
from obswebsocket import obsws
from obswebsocket import requests as obsrequests

# Paths for storage
settings_dir = os.path.join(os.path.expanduser("~"), 'AppData', 'Local', 'YourStreamingTools', 'BotOfTheSpecter')
os.makedirs(settings_dir, exist_ok=True)
icon_path = os.path.join(settings_dir, 'app-icon.ico')
settings_path = os.path.join(settings_dir, 'OBSConnectorSettings.ini')
log_path = os.path.join(settings_dir, 'OBSConnectorLog.txt')

# Configure logging
logging.basicConfig(
    filename=log_path,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Globals
specterSocket = SocketClient()
VERSION = "1.0"
NAME = "BotOftheSpecter OBS Connector"

# Download the icon file if it does not exist
async def download_icon():
    if not os.path.exists(icon_path):
        url = 'https://cdn.botofthespecter.com/app-builds/assets/icons/app-icon.ico'
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        with open(icon_path, 'wb') as f:
                            f.write(await response.read())
        except Exception as e:
            logging.info(f"Error downloading icon: {e}")

# Run the icon download
asyncio.run(download_icon())

# Load settings from the INI file
def load_settings():
    config = configparser.ConfigParser()
    if os.path.exists(settings_path):
        config.read(settings_path)
        if 'VERSION' in config:
            stored_version = config['VERSION'].get('version', None)
            if stored_version != VERSION:
                api_settings = dict(config.items('API')) if 'API' in config else {}
                obs_settings = dict(config.items('OBS')) if 'OBS' in config else {}
                os.remove(settings_path)
                config = configparser.ConfigParser()
                config.add_section('VERSION')
                config.set('VERSION', 'version', VERSION)
                config.add_section('API')
                for key, value in api_settings.items():
                    config.set('API', key, value)
                config.add_section('OBS')
                for key, value in obs_settings.items():
                    config.set('OBS', key, value)
                with open(settings_path, 'w') as f:
                    config.write(f)
        else:
            api_settings = dict(config.items('API')) if 'API' in config else {}
            obs_settings = dict(config.items('OBS')) if 'OBS' in config else {}
            os.remove(settings_path)
            config = configparser.ConfigParser()
            config.add_section('VERSION')
            config.set('VERSION', 'version', VERSION)
            config.add_section('API')
            for key, value in api_settings.items():
                config.set('API', key, value)
            config.add_section('OBS')
            for key, value in obs_settings.items():
                config.set('OBS', key, value)
            with open(settings_path, 'w') as f:
                config.write(f)
    else:
        config.add_section('VERSION')
        config.set('VERSION', 'version', VERSION)
        config.add_section('API')
        config.set('API', 'apiKey', '')
        config.add_section('OBS')
        config.set('OBS', 'server_ip', 'localhost')
        config.set('OBS', 'server_port', '4455')
        config.set('OBS', 'server_password', '')
        with open(settings_path, 'w') as f:
            config.write(f)
    return config

# Save settings to the INI file
def save_settings(config):
    with open(settings_path, 'w') as configfile:
        config.write(configfile)

# Get the settings for the OBS WebSocket Server
async def obs_websocket_settings():
    settings = load_settings()
    server_ip = settings.get('OBS', 'server_ip', fallback='localhost')
    server_port = settings.get('OBS', 'server_port', fallback='4455')
    server_password = settings.get('OBS', 'server_password', fallback='')
    return server_ip, server_port, server_password

# API key validation function
async def validate_api_key(api_key):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://api.botofthespecter.com/checkkey', params={'api_key': api_key}) as response:
                if response.status == 200:
                    data = await response.json()
                    logging.info(f"API Key Validation: {data}")
                    return data.get('status') == 'Valid API Key'
        return False
    except aiohttp.exceptions.RequestException as e:
        logging.error(f"API Key Validation Error: {e}")
        return False

# WebSocket connection event handler
async def specter_websocket(specter_thread):
    specter_websocket_uri = "wss://websocket.botofthespecter.com"
    while True:
        try:
            await specterSocket.connect(specter_websocket_uri)
            specter_thread.connection_status.emit(True)
            while True:
                await asyncio.sleep(10)
                if not specterSocket.connected:
                    specter_thread.connection_status.emit(False)
                    break
        except socketio.exceptions.ConnectionError as ConnectionError:
            logging.error(f"SpecterWebSocket ConnectionError Error: {ConnectionError}")
            specter_thread.connection_status.emit(False)
            await asyncio.sleep(10)
        except Exception as e:
            logging.error(f"SpecterWebSocket Error: {e}")
            specter_thread.connection_status.emit(False)
            await asyncio.sleep(10)
        finally:
            specter_thread.connection_status.emit(False)

# Function to connect to OBS WebSocket server
async def obs_websocket(obs_thread):
    cancellation_event = asyncio.Event()
    while True:
        try:
            server_ip, server_port, server_password = await obs_websocket_settings()
            obsSocket = obsws(server_ip, server_port, server_password)
            obsSocket.connect()
            obs_thread.obs_connection_status.emit(True)
            obsSocket.register(on_event)
            while True:
                await asyncio.sleep(1)
                if not obsSocket.ws or not obsSocket.ws.connected:
                    obs_thread.obs_connection_status.emit(False)
                    break
            await cancellation_event.wait()
            if cancellation_event.is_set():
                break
        except obswebsocket.exceptions.ConnectionFailure as ConnectionFailure:
            logging.error(f"obsWebSocket ConnectionFailure: {ConnectionFailure}")
            obs_thread.obs_connection_status.emit(False)
            await asyncio.sleep(10)
        except Exception as e:
            logging.error(f"obsWebSocket Error: {e}")
            obs_thread.obs_connection_status.emit(False)
            await asyncio.sleep(10)
        finally:
            if obsSocket.ws and obsSocket.ws.connected:
                obsSocket.disconnect()
                obs_thread.obs_connection_status.emit(False)

# Handle OBS events and send them to Specter server
def on_event(event):
    asyncio.run(send_obs_event_to_specter(event))

async def send_obs_event_to_specter(event):
    try:
        def custom_serializer(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")
        def extract_event_data(event):
            event_data = {}
            if isinstance(event, dict):
                event_data = event
            elif hasattr(event, '__dict__'):
                event_data = vars(event)
            else:
                event_data = str(event)
            if (event_data.get("name") == "SceneItemEnableStateChanged" and isinstance(event_data.get("datain"), dict)):
                datain = event_data["datain"]
                if "sceneItemEnabled" in datain:
                    return "SceneItemEnableStateChanged", None
            return None, event_data
        event_name, event_data = extract_event_data(event)
        if event_data is None:
            logging.info(f"Event \"{event_name}\" filtered out and not sent.")
            return  # Skip sending request
        API_TOKEN = load_settings()['API'].get('apiKey')
        payload = {'data': json.dumps(event_data, default=custom_serializer)}
        async with aiohttp.ClientSession() as session:
            url = f'https://api.botofthespecter.com/SEND_OBS_EVENT?api_key={API_TOKEN}'
            try:
                form_data = aiohttp.FormData()
                for key, value in payload.items():
                    form_data.add_field(key, value)
                async with session.post(url, data=form_data) as response:
                    if response.status == 200:
                        logging.info(f"HTTPS event 'SEND_OBS_EVENT' sent successfully: {response.status}")
                    else:
                        logging.info(f"Failed to send HTTPS event 'SEND_OBS_EVENT'. Status: {response.status}")
                        response_text = await response.text()
                        logging.info("Response Body:", response_text)
            except Exception as e:
                logging.info(f"Error forwarding event: {e}")
    except Exception as e:
        logging.info(f"Error sending OBS event to Specter: {e}")

# Handle successful registration or connection
@specterSocket.event
async def event_success(data):
    logging.info(f"SpecterSocket Event: {data}")
    if hasattr(SpecterWebSocketThread, 'connection_status'):
        SpecterWebSocketThread.connection_status.emit(True)

# Handle server errors or failure to connect
@specterSocket.event
async def event_failure(data):
    logging.info(f"SpecterSocket Event: {data}")
    if hasattr(SpecterWebSocketThread, 'connection_status'):
        SpecterWebSocketThread.connection_status.emit(False)

# Handle disconnection
@specterSocket.event
async def disconnect():
    logging.info(f"SpecterSocket Event: Disconncted")
    if hasattr(SpecterWebSocketThread, 'connection_status'):
        SpecterWebSocketThread.connection_status.emit(False)

# Settings Window
class APISettingsPage(QWidget):
    api_key_saved = pyqtSignal()

    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        title_label = QLabel("Specter System API Key", self)
        title_label.setAlignment(Qt.AlignHCenter)
        title_label.setStyleSheet("font-size: 20px; font-weight: bold; padding-bottom: 20px; color: #FFFFFF;")
        self.api_key_input = QLineEdit(self)
        self.api_key_input.setPlaceholderText("Enter API Key")
        self.api_key_input.setStyleSheet("background-color: #555555; color: #FFFFFF; padding: 5px; border-radius: 5px;")
        settings = load_settings()
        api_key = settings['API'].get('apiKey', '') if 'API' in settings else ''
        self.api_key_input.setText(api_key)
        save_button = QPushButton("Save API Key", self)
        save_button.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        save_button.clicked.connect(self.save_api_key)
        self.error_label = QLabel("", self)
        self.error_label.setStyleSheet("color: red; font-size: 12px;")
        back_button = QPushButton("Back", self)
        back_button.setStyleSheet("background-color: #007BFF; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        back_button.clicked.connect(self.go_back)
        form_layout = QFormLayout()
        form_layout.addRow("API Key:", self.api_key_input)
        form_layout.addRow(self.error_label)
        main_layout = QVBoxLayout()
        main_layout.addWidget(title_label)
        main_layout.addLayout(form_layout)
        main_layout.addWidget(save_button)
        main_layout.addWidget(back_button)
        self.setLayout(main_layout)

    def save_api_key(self):
        api_key = self.api_key_input.text()
        settings = load_settings()
        if settings:
            try:
                if api_key != settings['API'].get('apiKey', ''):
                    if asyncio.run(validate_api_key(api_key)):
                        settings.set('API', 'apiKey', api_key)
                        save_settings(settings)
                        self.error_label.setText("")
                        self.api_key_saved.emit()
                        self.main_window.show_main_page()
                    else:
                        self.error_label.setText("Invalid API Key. Please try again.")
                else:
                    self.error_label.setText("API Key is already set.")
            except AttributeError:
                if api_key != settings['API'].get('apikey', ''):
                    if asyncio.run(validate_api_key(api_key)):
                        settings.set('API', 'apiKey', api_key)
                        save_settings(settings)
                        self.error_label.setText("")
                        self.api_key_saved.emit()
                        self.main_window.show_main_page()
                    else:
                        self.error_label.setText("Invalid API Key. Please try again.")
                else:
                    self.error_label.setText("API Key is already set.")
        else:
            self.error_label.setText("Failed to load settings.")
    
    def go_back(self):
        self.main_window.show_main_page()

# OBS Settings Window
class OBSSettingsPage(QWidget):
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        title_label = QLabel("OBS WebSocket Settings", self)
        title_label.setAlignment(Qt.AlignHCenter)
        title_label.setStyleSheet("font-size: 20px; font-weight: bold; padding-bottom: 20px; color: #FFFFFF;")
        settings = load_settings()
        self.server_ip_input = QLineEdit(self)
        self.server_ip_input.setText(settings.get('OBS', 'server_ip', fallback='localhost'))
        self.server_ip_input.setPlaceholderText("Enter OBS WebSocket IP")
        self.server_ip_input.setStyleSheet("background-color: #555555; color: #FFFFFF; padding: 5px; border-radius: 5px;")
        self.server_port_input = QLineEdit(self)
        self.server_port_input.setText(settings.get('OBS', 'server_port', fallback='4455'))
        self.server_port_input.setPlaceholderText("Enter OBS WebSocket Port")
        self.server_port_input.setStyleSheet("background-color: #555555; color: #FFFFFF; padding: 5px; border-radius: 5px;")
        self.server_password_input = QLineEdit(self)
        self.server_password_input.setText(settings.get('OBS', 'server_password', fallback=''))
        self.server_password_input.setPlaceholderText("Enter OBS WebSocket Password")
        self.server_password_input.setStyleSheet("background-color: #555555; color: #FFFFFF; padding: 5px; border-radius: 5px;")
        save_button = QPushButton("Save OBS Settings", self)
        save_button.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        save_button.clicked.connect(self.save_obs_settings)
        back_button = QPushButton("Back", self)
        back_button.setStyleSheet("background-color: #007BFF; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        back_button.clicked.connect(self.go_back)
        form_layout = QFormLayout()
        form_layout.addRow("Server IP:", self.server_ip_input)
        form_layout.addRow("Server Port:", self.server_port_input)
        form_layout.addRow("Server Password:", self.server_password_input)
        main_layout = QVBoxLayout()
        main_layout.addWidget(title_label)
        main_layout.addLayout(form_layout)
        main_layout.addWidget(save_button)
        main_layout.addWidget(back_button)
        self.setLayout(main_layout)

    def save_obs_settings(self):
        server_ip = self.server_ip_input.text()
        server_port = self.server_port_input.text()
        server_password = self.server_password_input.text()
        settings = load_settings()
        settings.set('OBS', 'server_ip', server_ip)
        settings.set('OBS', 'server_port', server_port)
        settings.set('OBS', 'server_password', server_password)
        save_settings(settings)
        self.main_window.show_main_page()

    def go_back(self):
        self.main_window.show_main_page()

# Thread for running Specter websocket
class SpecterWebSocketThread(QThread):
    connection_status = pyqtSignal(bool)
    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        task = loop.create_task(specter_websocket(self))
        try:
            loop.run_until_complete(task)
        except asyncio.CancelledError:
            pass
        finally:
            loop.close()

# Thread for running OBS websocket
class OBSWebSocketThread(QThread):
    obs_connection_status = pyqtSignal(bool)
    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        task = loop.create_task(obs_websocket(self))
        try:
            loop.run_until_complete(task)
        except asyncio.CancelledError:
            pass
        finally:
            loop.close()

# MainWindow
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(NAME)
        self.setGeometry(100, 100, 500, 250)
        self.setWindowIcon(QIcon(icon_path))
        self.stack = QStackedWidget(self)
        self.setCentralWidget(self.stack)
        # Add menu bar
        self.init_menu_bar()
        # Main page layout
        self.main_page = QWidget()
        main_layout = QVBoxLayout()
        # Title label
        title_label = QLabel(NAME, self)
        title_label.setAlignment(Qt.AlignHCenter)
        title_label.setStyleSheet("font-size: 24px; font-weight: bold; color: #FFFFFF;")
        # Connection status labels
        self.connection_status_label = QLabel("Specter WebSocket Connection: Connecting", self)
        self.connection_status_label.setAlignment(Qt.AlignCenter)
        self.connection_status_label.setStyleSheet("font-size: 16px; color: #FF0000;")
        self.obs_connection_status_label = QLabel("OBS WebSocket Connection: Connecting", self)
        self.obs_connection_status_label.setAlignment(Qt.AlignCenter)
        self.obs_connection_status_label.setStyleSheet("font-size: 16px; color: #FF0000;")
        # Group the connection status labels
        status_layout = QVBoxLayout()
        status_layout.setSpacing(0)
        status_layout.setAlignment(Qt.AlignCenter)
        status_layout.addWidget(self.connection_status_label)
        status_layout.addWidget(self.obs_connection_status_label)
        # Buttons layout
        button_layout = QHBoxLayout()
        api_key_button = QPushButton("API Key", self)
        api_key_button.setStyleSheet("background-color: #007BFF; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        api_key_button.clicked.connect(self.show_api_key_page)
        obs_settings_button = QPushButton("OBS Settings", self)
        obs_settings_button.setStyleSheet("background-color: #007BFF; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
        obs_settings_button.clicked.connect(self.show_obs_settings_page)
        button_layout.addWidget(api_key_button)
        button_layout.addWidget(obs_settings_button)
        # Add elements to the main layout
        main_layout.addWidget(title_label)
        main_layout.addLayout(status_layout)
        main_layout.addLayout(button_layout)
        self.main_page.setLayout(main_layout)
        self.stack.addWidget(self.main_page)
        # Settings pages
        self.settings_page = APISettingsPage(self)
        self.settings_page.api_key_saved.connect(self.show_main_page)
        self.stack.addWidget(self.settings_page)
        self.obs_settings_page = OBSSettingsPage(self)
        self.stack.addWidget(self.obs_settings_page)
        # Start separate threads for each WebSocket connection
        self.specter_thread = SpecterWebSocketThread()
        self.specter_thread.connection_status.connect(self.update_connection_status)
        self.specter_thread.start()
        self.obs_thread = OBSWebSocketThread()
        self.obs_thread.obs_connection_status.connect(self.update_obs_connection_status)
        self.obs_thread.start()
        # Load settings and display the appropriate page
        settings = load_settings()
        if not settings.get('API', 'apiKey'):
            self.show_api_key_page()
        else:
            self.show_main_page()

    def init_menu_bar(self):
        menu_bar = self.menuBar()
        menu_bar.setStyleSheet("""
            QMenuBar {
                background-color: #FFFFFF;
                color: #000000;
                font-size: 14px;
                font-weight: bold;
            }
            QMenuBar::item {
                background-color: transparent;
                padding: 5px 10px;
            }
            QMenuBar::item:selected {
                background-color: #007BFF;
                color: #FFFFFF;
            }
            QMenu {
                background-color: #FFFFFF;
                color: #000000;
                font-size: 14px;
            }
            QMenu::item {
                padding: 5px 10px;
            }
            QMenu::item:selected {
                background-color: #007BFF;
                color: #FFFFFF;
            }
        """)
        # File menu
        file_menu = menu_bar.addMenu("File")
        home_key_action = QAction("Home", self)
        home_key_action.triggered.connect(self.show_main_page)
        api_key_action = QAction("API Key", self)
        api_key_action.triggered.connect(self.show_api_key_page)
        obs_settings_action = QAction("OBS Settings", self)
        obs_settings_action.triggered.connect(self.show_obs_settings_page)
        exit_action = QAction("Exit", self)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(home_key_action)
        file_menu.addAction(api_key_action)
        file_menu.addAction(obs_settings_action)
        file_menu.addSeparator() # Spacer
        file_menu.addAction(exit_action)
        # View menu
        view_menu = menu_bar.addMenu("View")
        logs_action = QAction("Logs", self)
        logs_action.triggered.connect(self.show_logs)
        view_menu.addAction(logs_action)
        # Help menu
        help_menu = menu_bar.addMenu("Help")
        about_action = QAction("About", self)
        about_action.triggered.connect(self.show_about_dialog)
        user_guide_action = QAction("User Guide", self)
        user_guide_action.triggered.connect(self.open_user_guide)
        help_menu.addAction(about_action)
        help_menu.addAction(user_guide_action)

    def show_logs(self):
        if not hasattr(self, 'log_window') or self.log_window is None:
            self.log_window = QWidget()
            log_layout = QVBoxLayout()
            self.log_text_edit = QTextEdit(self)
            self.log_text_edit.setReadOnly(True)
            self.log_text_edit.setStyleSheet("color: #FFFFFF; background-color: #333333; border: none;")
            log_layout.addWidget(self.log_text_edit)
            refresh_button = QPushButton("Refresh Logs", self)
            refresh_button.clicked.connect(lambda: self.load_logs(self.log_text_edit))
            log_layout.addWidget(refresh_button)
            self.log_window.setLayout(log_layout)
            self.log_window.setWindowTitle(f"{NAME} - Logs")
            self.log_window.resize(600, 400)
            self.log_window.setWindowIcon(QIcon(icon_path))
        self.load_logs(self.log_text_edit)
        self.log_window.show()

    def load_logs(self, log_text_edit):
        try:
            with open(log_path, "r") as log_file:
                log_content = log_file.read()
                log_text_edit.setPlainText(log_content)
                log_text_edit.moveCursor(QTextCursor.End)
        except Exception as e:
            logging.info(f"Error in loading logs: {e}")
            QMessageBox.information(self, f"{NAME} - Logs", f"Error loading log file: {e}")

    def open_user_guide(self):
        QMessageBox.information(self, "User Guide", "Open the user guide or documentation.")

    def show_about_dialog(self):
        if not hasattr(self, 'about_window') or self.about_window is None:
            self.about_window = QWidget()
            about_layout = QVBoxLayout()
            label_text = f"{NAME}\nVersion {VERSION}\nDeveloped by: gfaUnDead"
            about_text = QLabel(label_text, self)
            about_text.setStyleSheet("color: #FFFFFF; background-color: #333333; font-size: 16px; padding: 10px;")
            about_layout.addWidget(about_text)
            close_button = QPushButton("Close", self)
            close_button.setStyleSheet("background-color: #007BFF; color: white; font-weight: bold; padding: 10px; border-radius: 5px;")
            close_button.clicked.connect(self.about_window.close)
            about_layout.addWidget(close_button)
            self.about_window.setLayout(about_layout)
            self.about_window.setWindowTitle(f"{NAME} - About")
            self.about_window.resize(400, 200)
            self.about_window.setWindowIcon(QIcon(icon_path))
        self.about_window.show()

    def show_api_key_page(self):
        self.stack.setCurrentWidget(self.settings_page)

    def show_obs_settings_page(self):
        self.stack.setCurrentWidget(self.obs_settings_page)

    def show_main_page(self):
        self.stack.setCurrentWidget(self.main_page)

    def update_connection_status(self, connected):
        if connected:
            self.connection_status_label.setText("Specter WebSocket Connection: Connected")
            self.connection_status_label.setStyleSheet("font-size: 16px; color: #00FF00;")
        else:
            self.connection_status_label.setText("Specter WebSocket Connection: Not Connected")
            self.connection_status_label.setStyleSheet("font-size: 16px; color: #FF0000;")

    def update_obs_connection_status(self, connected):
        if connected:
            self.obs_connection_status_label.setText("OBS WebSocket Connection: Connected")
            self.obs_connection_status_label.setStyleSheet("font-size: 16px; color: #00FF00;")
        else:
            self.obs_connection_status_label.setText("OBS WebSocket Connection: Not Connected")
            self.obs_connection_status_label.setStyleSheet("font-size: 16px; color: #FF0000;")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    palette = app.palette()
    palette.setColor(palette.Window, QColor("#333333"))
    palette.setColor(palette.WindowText, QColor("#FFFFFF"))
    palette.setColor(palette.Base, QColor("#444444"))
    palette.setColor(palette.AlternateBase, QColor("#555555"))
    palette.setColor(palette.ToolTipBase, QColor("#FFFFFF"))
    palette.setColor(palette.ToolTipText, QColor("#000000"))
    app.setPalette(palette)
    MainWindow().show()
    sys.exit(app.exec_())
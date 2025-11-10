import os
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox
)
from PyQt6.QtGui import QIcon
from config import Config
from constants import ICON_FILE, download_icon, bot_logger
from bot_connector import BotOfTheSpecterConnector
from obs_connector import OBSConnector

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.config = Config()
        self.bot_connector = None
        self.obs_connector = None
        self.log_expanded = self.config.get('log_expanded', False)
        download_icon()
        self.init_ui()
        if os.path.exists(ICON_FILE):
            self.setWindowIcon(QIcon(ICON_FILE))

    def init_ui(self):
        self.setWindowTitle('BotOfTheSpecter - OBS Connector')
        self.setGeometry(300, 300, 600, 500)
        layout = QVBoxLayout()
        # BotOfTheSpecter Group
        bot_group = self._create_bot_group()
        layout.addWidget(bot_group)
        # OBS Group
        obs_group = self._create_obs_group()
        layout.addWidget(obs_group)
        # Log Area with collapse/expand button
        log_header_layout = QHBoxLayout()
        self.log_toggle_btn = QPushButton("▶ Event Log")
        self.log_toggle_btn.setMaximumWidth(150)
        self.log_toggle_btn.clicked.connect(self.toggle_log_visibility)
        log_header_layout.addWidget(self.log_toggle_btn)
        log_header_layout.addStretch()
        layout.addLayout(log_header_layout)
        log_group = QGroupBox("Event Log")
        log_layout = QVBoxLayout()
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        log_layout.addWidget(self.log_area)
        log_group.setLayout(log_layout)
        self.log_group = log_group
        layout.addWidget(log_group)
        layout.addStretch()
        self.setLayout(layout)
        # Set initial log visibility
        self.set_log_visibility(self.log_expanded)
        # Auto-connect if API key exists
        api_key = self.config.get('api_key', '')
        if api_key:
            self.bot_connect_btn.setEnabled(True)
            self.connect_bot()
        # Auto-connect to OBS if settings exist
        obs_host = self.config.get('obs_host')
        obs_port = self.config.get('obs_port')
        obs_password = self.config.get('obs_password')
        if obs_host and obs_port and obs_password:
            self.connect_obs()

    def _create_bot_group(self):
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
        self.bot_connect_btn.clicked.connect(self.toggle_bot_connection)
        self.bot_connect_btn.setEnabled(False)
        bot_layout.addWidget(self.bot_connect_btn)
        bot_group.setLayout(bot_layout)
        return bot_group

    def _create_obs_group(self):
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
        self.obs_connect_btn.clicked.connect(self.toggle_obs_connection)
        obs_layout.addWidget(self.obs_connect_btn)
        obs_group.setLayout(obs_layout)
        return obs_group

    def validate_api_key(self):
        api_key = self.api_key_input.text()
        if not api_key:
            QMessageBox.warning(self, "Validation", "Please enter an API key.")
            return
        QMessageBox.information(self, "Validation", "API Key accepted. Connection will be validated when connecting.")
        self.config.set('api_key', api_key)
        self.bot_connect_btn.setEnabled(True)

    def toggle_bot_connection(self):
        if self.bot_connect_btn.text() == "Connect":
            self.connect_bot()
        else:
            self.disconnect_bot()

    def connect_bot(self):
        if self.bot_connector and self.bot_connector.isRunning():
            self.bot_connector.should_stop = False
            self.bot_connect_btn.setText("Disconnect")
            bot_logger.info("Resume connection requested")
            return
        api_key = self.api_key_input.text()
        if not api_key:
            QMessageBox.warning(self, "Connection Error", "Please enter an API key first.")
            return
        self.bot_connector = BotOfTheSpecterConnector(api_key, self.obs_connector)
        self.bot_connector.status_update.connect(self.update_bot_status)
        self.bot_connector.event_received.connect(self.log_event)
        self.bot_connector.start()
        self.bot_connect_btn.setText("Disconnect")

    def disconnect_bot(self):
        if self.bot_connector:
            self.bot_connector.disconnect()
            if self.bot_connector.isRunning():
                self.bot_connector.wait(timeout=5000)
            self.bot_connect_btn.setText("Connect")

    def connect_obs(self):
        if self.obs_connector and self.obs_connector.isRunning():
            self.obs_connector.should_stop = False
            self.obs_connect_btn.setText("Disconnect")
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

    def toggle_obs_connection(self):
        if self.obs_connect_btn.text() == "Connect":
            self.connect_obs()
        else:
            self.disconnect_obs()

    def disconnect_obs(self):
        if self.obs_connector:
            self.obs_connector.disconnect()
            if self.obs_connector.isRunning():
                self.obs_connector.wait(timeout=5000)
            self.obs_connect_btn.setText("Connect")

    def update_bot_status(self, status):
        self.bot_status.setText(f"Status: {status}")

    def update_obs_status(self, status):
        self.obs_status.setText(f"Status: {status}")

    def log_event(self, event):
        self.log_area.append(event)

    def toggle_log_visibility(self):
        self.log_expanded = not self.log_expanded
        self.set_log_visibility(self.log_expanded)
        self.config.set('log_expanded', self.log_expanded)

    def set_log_visibility(self, visible):
        self.log_group.setVisible(visible)
        arrow = "▼ Event Log" if visible else "▶ Event Log"
        self.log_toggle_btn.setText(arrow)
import os
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox,
    QScrollArea, QFrame, QSizePolicy
)
from PyQt6.QtGui import QIcon, QFont, QColor
from PyQt6.QtCore import Qt, QTimer
from config import Config
from constants import ICON_FILE, download_icon, bot_logger
from bot_connector import BotOfTheSpecterConnector
from obs_connector import OBSConnector

class ModernButton(QPushButton):
    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setMinimumHeight(40)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.apply_style()

    def apply_style(self):
        self.setStyleSheet("""
            QPushButton {
                background-color: #0078d4;
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: bold;
                font-size: 11px;
                padding: 8px 16px;
            }
            QPushButton:hover {
                background-color: #1084d8;
            }
            QPushButton:pressed {
                background-color: #005a9e;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #666666;
            }
        """)

class ModernStatusButton(QPushButton):
    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setMinimumHeight(40)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connected = False
        self.update_style()

    def set_connected(self, connected):
        self.connected = connected
        self.update_style()

    def update_style(self):
        if self.connected:
            self.setStyleSheet("""
                QPushButton {
                    background-color: #107c10;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 11px;
                    padding: 8px 16px;
                }
                QPushButton:hover {
                    background-color: #128713;
                }
                QPushButton:pressed {
                    background-color: #0d6b0d;
                }
            """)
            self.setText("Disconnect")
        else:
            self.setStyleSheet("""
                QPushButton {
                    background-color: #0078d4;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 11px;
                    padding: 8px 16px;
                }
                QPushButton:hover {
                    background-color: #1084d8;
                }
                QPushButton:pressed {
                    background-color: #005a9e;
                }
            """)
            self.setText("Connect")

class ModernLineEdit(QLineEdit):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.apply_style()

    def apply_style(self):
        self.setStyleSheet("""
            QLineEdit {
                background-color: #2d2d2d;
                color: #ffffff;
                border: 2px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
                font-size: 11px;
            }
            QLineEdit:focus {
                border: 2px solid #0078d4;
                background-color: #1e1e1e;
            }
        """)

class ModernGroupBox(QGroupBox):
    def __init__(self, title, parent=None):
        super().__init__(title, parent)
        self.apply_style()

    def apply_style(self):
        self.setStyleSheet("""
            QGroupBox {
                color: #ffffff;
                border: 1px solid #3d3d3d;
                border-radius: 6px;
                margin-top: 8px;
                padding-top: 16px;
                font-weight: bold;
                font-size: 12px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 3px 0 3px;
            }
        """)

class StatusPanel(QWidget):
    def __init__(self):
        super().__init__()
        self.setStyleSheet("""
            StatusPanel {
                background-color: #252525;
                border: 1px solid #3d3d3d;
                border-radius: 6px;
                padding: 12px;
            }
        """)
        self.init_ui()
    
    def init_ui(self):
        layout = QHBoxLayout()
        layout.setSpacing(24)
        layout.setContentsMargins(0, 0, 0, 0)
        # Streaming Column
        stream_column = QVBoxLayout()
        stream_column.setSpacing(8)
        stream_title = QLabel("Streaming")
        stream_title.setStyleSheet("font-weight: bold; color: #ffffff; font-size: 12px;")
        stream_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.stream_status = QLabel("🔴 OFF")
        self.stream_status.setStyleSheet("color: #f55047; font-weight: bold; text-align: center;")
        self.stream_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        stream_bitrate_label = QLabel("Bitrate:")
        stream_bitrate_label.setStyleSheet("color: #aaaaaa; font-size: 10px;")
        stream_bitrate_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.stream_bitrate = QLabel("0 Kbps")
        self.stream_bitrate.setStyleSheet("color: #0078d4; font-weight: bold; font-size: 11px;")
        self.stream_bitrate.setAlignment(Qt.AlignmentFlag.AlignCenter)
        stream_column.addWidget(stream_title)
        stream_column.addWidget(self.stream_status)
        stream_column.addWidget(stream_bitrate_label)
        stream_column.addWidget(self.stream_bitrate)
        stream_column.addStretch()
        # Recording Column
        record_column = QVBoxLayout()
        record_column.setSpacing(8)
        record_title = QLabel("Recording")
        record_title.setStyleSheet("font-weight: bold; color: #ffffff; font-size: 12px;")
        record_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.record_status = QLabel("🔴 OFF")
        self.record_status.setStyleSheet("color: #f55047; font-weight: bold; text-align: center;")
        self.record_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        record_bitrate_label = QLabel("Bitrate:")
        record_bitrate_label.setStyleSheet("color: #aaaaaa; font-size: 10px;")
        record_bitrate_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.record_bitrate = QLabel("0 Kbps")
        self.record_bitrate.setStyleSheet("color: #0078d4; font-weight: bold; font-size: 11px;")
        self.record_bitrate.setAlignment(Qt.AlignmentFlag.AlignCenter)
        record_column.addWidget(record_title)
        record_column.addWidget(self.record_status)
        record_column.addWidget(record_bitrate_label)
        record_column.addWidget(self.record_bitrate)
        record_column.addStretch()
        # Replay Buffer Column
        replay_column = QVBoxLayout()
        replay_column.setSpacing(8)
        replay_title = QLabel("Replay Buffer")
        replay_title.setStyleSheet("font-weight: bold; color: #ffffff; font-size: 12px;")
        replay_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.replay_status = QLabel("⚫ DISABLED")
        self.replay_status.setStyleSheet("color: #aaaaaa; font-weight: bold; text-align: center;")
        self.replay_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        replay_column.addWidget(replay_title)
        replay_column.addWidget(self.replay_status)
        replay_column.addStretch()
        layout.addLayout(stream_column)
        layout.addLayout(record_column)
        layout.addLayout(replay_column)
        self.setLayout(layout)

    def update_status(self, status_dict):
        # Update streaming status
        if status_dict.get('streaming', False):
            self.stream_status.setText("🟢 ON")
            self.stream_status.setStyleSheet("color: #4ec745; font-weight: bold; text-align: center;")
        else:
            self.stream_status.setText("🔴 OFF")
            self.stream_status.setStyleSheet("color: #f55047; font-weight: bold; text-align: center;")
        # Update recording status
        if status_dict.get('recording', False):
            self.record_status.setText("🟢 ON")
            self.record_status.setStyleSheet("color: #4ec745; font-weight: bold; text-align: center;")
        else:
            self.record_status.setText("🔴 OFF")
            self.record_status.setStyleSheet("color: #f55047; font-weight: bold; text-align: center;")
        # Update replay buffer status
        if status_dict.get('replay_buffer', False):
            self.replay_status.setText("🟢 ENABLED")
            self.replay_status.setStyleSheet("color: #4ec745; font-weight: bold; text-align: center;")
        else:
            self.replay_status.setText("⚫ DISABLED")
            self.replay_status.setStyleSheet("color: #aaaaaa; font-weight: bold; text-align: center;")
        # Update streaming bitrate
        stream_bitrate = status_dict.get('stream_bitrate', 0)
        if stream_bitrate > 0:
            self.stream_bitrate.setText(f"{stream_bitrate} Kbps")
        else:
            self.stream_bitrate.setText("0 Kbps")
        # Update recording bitrate
        record_bitrate = status_dict.get('record_bitrate', 0)
        if record_bitrate > 0:
            self.record_bitrate.setText(f"{record_bitrate} Kbps")
        else:
            self.record_bitrate.setText("0 Kbps")

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.config = Config()
        self.bot_connector = None
        self.obs_connector = None
        self.log_expanded = self.config.get('log_expanded', False)
        self.is_locked = False  # Lock state - when True, OBS commands are ignored
        # Initialize status refresh timer
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self.refresh_status)
        download_icon()
        self.init_ui()
        if os.path.exists(ICON_FILE):
            self.setWindowIcon(QIcon(ICON_FILE))
        self.apply_global_style()

    def init_ui(self):
        self.setWindowTitle('BotOfTheSpecter - OBS Connector')
        self.setGeometry(100, 100, 800, 900)
        self.setMinimumSize(700, 800)
        main_layout = QVBoxLayout()
        main_layout.setSpacing(16)
        main_layout.setContentsMargins(16, 16, 16, 16)
        # Header with lock button
        header_layout = QHBoxLayout()
        header_label = QLabel('BotOfTheSpecter - OBS Connector')
        header_font = QFont()
        header_font.setPointSize(16)
        header_font.setBold(True)
        header_label.setFont(header_font)
        header_label.setStyleSheet("color: #ffffff; background-color: transparent;")
        header_layout.addWidget(header_label)
        header_layout.addStretch()
        # Lock/Unlock button
        self.lock_btn = ModernButton("🔓 Unlocked")
        self.lock_btn.setMaximumWidth(150)
        self.lock_btn.setStyleSheet("""
            ModernButton {
                background-color: #4ec745;
                color: #ffffff;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 11px;
            }
            ModernButton:hover {
                background-color: #5fd855;
            }
            ModernButton:pressed {
                background-color: #3fa536;
            }
        """)
        self.lock_btn.clicked.connect(self.toggle_lock)
        header_layout.addWidget(self.lock_btn)
        main_layout.addLayout(header_layout)
        # Create scroll area for content
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: #1e1e1e;
            }
            QScrollBar:vertical {
                background-color: #2d2d2d;
                width: 12px;
                border-radius: 6px;
            }
            QScrollBar::handle:vertical {
                background-color: #555555;
                border-radius: 6px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background-color: #707070;
            }
        """)
        scroll_content = QWidget()
        scroll_layout = QVBoxLayout()
        scroll_layout.setSpacing(16)
        scroll_layout.setContentsMargins(0, 0, 0, 0)
        # BotOfTheSpecter Group
        bot_group = self._create_bot_group()
        scroll_layout.addWidget(bot_group)
        # OBS Group
        obs_group = self._create_obs_group()
        scroll_layout.addWidget(obs_group)
        # Log Area with collapse/expand button
        log_header_layout = QHBoxLayout()
        log_header_layout.setSpacing(8)
        self.log_toggle_btn = QPushButton("▼ Event Log")
        self.log_toggle_btn.setMaximumWidth(140)
        self.log_toggle_btn.setStyleSheet("""
            QPushButton {
                background-color: #2d2d2d;
                color: #ffffff;
                border: 1px solid #3d3d3d;
                border-radius: 4px;
                font-weight: bold;
                padding: 6px 12px;
            }
            QPushButton:hover {
                background-color: #3d3d3d;
            }
            QPushButton:pressed {
                background-color: #1d1d1d;
            }
        """)
        self.log_toggle_btn.clicked.connect(self.toggle_log_visibility)
        log_header_layout.addWidget(self.log_toggle_btn)
        log_header_layout.addStretch()
        scroll_layout.addLayout(log_header_layout)
        log_group = ModernGroupBox("Event Log")
        log_layout = QVBoxLayout()
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setStyleSheet("""
            QTextEdit {
                background-color: #252525;
                color: #e0e0e0;
                border: 1px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
                font-family: 'Courier New', monospace;
                font-size: 10px;
            }
        """)
        self.log_area.setMinimumHeight(150)
        log_layout.addWidget(self.log_area)
        log_group.setLayout(log_layout)
        self.log_group = log_group
        scroll_layout.addWidget(log_group)
        scroll_layout.addStretch()
        scroll_content.setLayout(scroll_layout)
        scroll_area.setWidget(scroll_content)
        main_layout.addWidget(scroll_area)
        self.setLayout(main_layout)
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
        bot_group = ModernGroupBox("BotOfTheSpecter Settings")
        bot_layout = QVBoxLayout()
        bot_layout.setSpacing(12)
        # API Key Input
        api_layout = QHBoxLayout()
        api_layout.setSpacing(8)
        api_label = QLabel("API Key:")
        api_label.setStyleSheet("font-weight: bold; min-width: 80px;")
        api_layout.addWidget(api_label)
        self.api_key_input = ModernLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        api_key = self.config.get('api_key', '')
        self.api_key_input.setText(api_key)
        api_layout.addWidget(self.api_key_input, 1)
        self.validate_btn = ModernButton("Validate")
        self.validate_btn.setMaximumWidth(100)
        self.validate_btn.clicked.connect(self.validate_api_key)
        api_layout.addWidget(self.validate_btn)
        bot_layout.addLayout(api_layout)
        # Status Label
        self.bot_status = QLabel("Status: ⚫ Not connected")
        self.bot_status.setStyleSheet("""
            color: #aaaaaa;
            font-size: 11px;
            padding: 8px;
            background-color: #2d2d2d;
            border-radius: 4px;
        """)
        bot_layout.addWidget(self.bot_status)
        # Connect Button
        self.bot_connect_btn = ModernStatusButton("Connect")
        self.bot_connect_btn.clicked.connect(self.toggle_bot_connection)
        self.bot_connect_btn.setEnabled(False)
        bot_layout.addWidget(self.bot_connect_btn)
        bot_group.setLayout(bot_layout)
        return bot_group

    def _create_obs_group(self):
        obs_group = ModernGroupBox("OBS WebSocket Settings")
        obs_layout = QVBoxLayout()
        obs_layout.setSpacing(12)
        # OBS Configuration Inputs
        obs_config_layout = QHBoxLayout()
        obs_config_layout.setSpacing(8)
        # Host
        host_label = QLabel("Host:")
        host_label.setStyleSheet("font-weight: bold; min-width: 50px;")
        obs_config_layout.addWidget(host_label)
        self.obs_host = ModernLineEdit()
        self.obs_host.setText(self.config.get('obs_host', 'localhost'))
        obs_config_layout.addWidget(self.obs_host, 1)
        # Port
        port_label = QLabel("Port:")
        port_label.setStyleSheet("font-weight: bold; min-width: 40px;")
        obs_config_layout.addWidget(port_label)
        self.obs_port = ModernLineEdit()
        self.obs_port.setText(str(self.config.get('obs_port', 4455)))
        self.obs_port.setMaximumWidth(100)
        obs_config_layout.addWidget(self.obs_port)
        # Password
        pwd_label = QLabel("Password:")
        pwd_label.setStyleSheet("font-weight: bold; min-width: 65px;")
        obs_config_layout.addWidget(pwd_label)
        self.obs_password = ModernLineEdit()
        self.obs_password.setEchoMode(QLineEdit.EchoMode.Password)
        self.obs_password.setText(self.config.get('obs_password', ''))
        obs_config_layout.addWidget(self.obs_password, 1)
        obs_layout.addLayout(obs_config_layout)
        # Status Label
        self.obs_status = QLabel("Status: ⚫ Not connected")
        self.obs_status.setStyleSheet("""
            color: #aaaaaa;
            font-size: 11px;
            padding: 8px;
            background-color: #2d2d2d;
            border-radius: 4px;
        """)
        obs_layout.addWidget(self.obs_status)
        # Status Panel
        self.status_panel = StatusPanel()
        obs_layout.addWidget(self.status_panel)
        # Connect Button
        self.obs_connect_btn = ModernStatusButton("Connect")
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

    def toggle_lock(self):
        self.is_locked = not self.is_locked
        if self.is_locked:
            self.lock_btn.setText("🔒 Locked")
            self.lock_btn.setStyleSheet("""
                ModernButton {
                    background-color: #f55047;
                    color: #ffffff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 11px;
                }
                ModernButton:hover {
                    background-color: #ff6655;
                }
                ModernButton:pressed {
                    background-color: #e03f3f;
                }
            """)
            self.log_event("🔒 Control Panel LOCKED - OBS commands will be ignored")
        else:
            self.lock_btn.setText("🔓 Unlocked")
            self.lock_btn.setStyleSheet("""
                ModernButton {
                    background-color: #4ec745;
                    color: #ffffff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 11px;
                }
                ModernButton:hover {
                    background-color: #5fd855;
                }
                ModernButton:pressed {
                    background-color: #3fa536;
                }
            """)
            self.log_event("🔓 Control Panel UNLOCKED - OBS commands will now work")

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
        self.bot_connector = BotOfTheSpecterConnector(api_key, self.obs_connector, main_window=self)
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
            # Start status refresh timer (if not already running)
            if not self.status_timer.isActive():
                self.status_timer.start(1000)  # Refresh every 1000ms
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
        # Start status refresh timer
        self.status_timer.start(1000)  # Refresh every 1000ms

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
            # Stop status refresh timer
            self.status_timer.stop()

    def refresh_status(self):
        if self.obs_connector and self.obs_connector.connected:
            try:
                status = self.obs_connector.get_stream_status()
                output_status = self.obs_connector.get_output_status()
                # Combine status and bitrate info for the panel
                combined_status = {
                    'streaming': status.get('streaming', False),
                    'recording': status.get('recording', False),
                    'replay_buffer': status.get('replay_buffer', False),
                    'stream_bitrate': output_status.get('stream_bitrate', 0),
                    'record_bitrate': output_status.get('record_bitrate', 0)
                }
                self.status_panel.update_status(combined_status)
            except Exception as e:
                bot_logger.error(f"Error refreshing status: {e}")

    def update_bot_status(self, status):
        status_text = f"Status: {status}"
        color = "#4ec745" if "Connected" in status else "#f55047" if "Error" in status or "Failed" in status else "#aaaaaa"
        indicator = "🟢 " if "Connected" in status else "🔴 " if "Error" in status or "Failed" in status else "⚫ "
        self.bot_status.setText(f"{indicator} {status_text}")
        self.bot_status.setStyleSheet(f"""
            color: {color};
            font-size: 11px;
            padding: 8px;
            background-color: #2d2d2d;
            border-radius: 4px;
        """)
        is_connected = "Connected" in status
        self.bot_connect_btn.set_connected(is_connected)

    def update_obs_status(self, status):
        status_text = f"Status: {status}"
        color = "#4ec745" if "Connected" in status else "#f55047" if "Error" in status or "Failed" in status else "#aaaaaa"
        indicator = "🟢 " if "Connected" in status else "🔴 " if "Error" in status or "Failed" in status else "⚫ "
        self.obs_status.setText(f"{indicator} {status_text}")
        self.obs_status.setStyleSheet(f"""
            color: {color};
            font-size: 11px;
            padding: 8px;
            background-color: #2d2d2d;
            border-radius: 4px;
        """)
        is_connected = "Connected" in status
        self.obs_connect_btn.set_connected(is_connected)

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

    def apply_global_style(self):
        self.setStyleSheet("""
            QWidget {
                background-color: #1e1e1e;
                color: #ffffff;
            }
            QLabel {
                color: #ffffff;
                background-color: transparent;
            }
            QLineEdit {
                background-color: #2d2d2d;
                color: #ffffff;
                border: 2px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
                selection-background-color: #0078d4;
            }
            QLineEdit:focus {
                border: 2px solid #0078d4;
            }
            QPushButton {
                background-color: #0078d4;
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: bold;
                padding: 8px 16px;
            }
            QPushButton:hover {
                background-color: #1084d8;
            }
            QPushButton:pressed {
                background-color: #005a9e;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #666666;
            }
            QGroupBox {
                color: #ffffff;
                border: 1px solid #3d3d3d;
                border-radius: 6px;
                margin-top: 8px;
                padding-top: 16px;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 3px 0 3px;
            }
            QTextEdit {
                background-color: #252525;
                color: #e0e0e0;
                border: 1px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
            }
            QScrollArea {
                background-color: #1e1e1e;
                border: none;
            }
            QScrollBar:vertical {
                background-color: #2d2d2d;
                width: 12px;
                border-radius: 6px;
            }
            QScrollBar::handle:vertical {
                background-color: #555555;
                border-radius: 6px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background-color: #707070;
            }
            QMessageBox {
                background-color: #1e1e1e;
            }
            QMessageBox QLabel {
                color: #ffffff;
            }
            QMessageBox QPushButton {
                min-width: 70px;
            }
        """)
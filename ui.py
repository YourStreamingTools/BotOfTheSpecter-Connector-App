import os
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QHeaderView,
    QLineEdit, QPushButton, QTextEdit, QGroupBox, QMessageBox,
    QScrollArea, QTreeWidget, QTreeWidgetItem, QStackedWidget, QSizePolicy
)
from PyQt6.QtGui import QIcon, QFont, QPixmap, QColor, QPainter, QAction, QTextCursor
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtWidgets import QMenu
from config import Config
from constants import ICON_FILE, download_icon, bot_logger, websocket_logger, VERSION
from bot_connector import BotOfTheSpecterConnector
from obs_connector import OBSConnector
from obs_connector import OBSConnector
from variable_manager import VariableManager
from botofthespecter_api import TwitchAPI
from reward_manager import RewardManager
from redemption_handler import RedemptionHandler
from ui_channel_points import ChannelPointsTab

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
            self.stream_bitrate.setText(self.format_bitrate(stream_bitrate))
        else:
            self.stream_bitrate.setText("0 kb/s")
        # Update recording bitrate
        record_bitrate = status_dict.get('record_bitrate', 0)
        if record_bitrate > 0:
            self.record_bitrate.setText(self.format_bitrate(record_bitrate))
        else:
            self.record_bitrate.setText("0 kb/s")

    def format_bitrate(self, kbps):
        # Always show in kb/s since that matches OBS settings
        return f"{kbps:.0f} kb/s"

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.config = Config()
        self.bot_connector = None
        self.obs_connector = None
        self.variable_manager = VariableManager(self.config)
        self.log_expanded = self.config.get('log_expanded', False)
        self.is_locked = False  # Lock state - when True, OBS commands are ignored
        # Initialize status refresh timer
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self.refresh_status)
        # Initialize Channel Points Managers
        api_key = self.config.get('api_key', '')
        # Only init TwitchAPI if we have a key, or init with empty? 
        # API expects key. Even empty string is fine for init (caught in _get_valid_token logic we added)
        self.twitch_api = TwitchAPI(api_key)
        self.reward_manager = RewardManager(self.config, self.twitch_api)
        self.redemption_handler = RedemptionHandler(self.reward_manager, self.obs_connector, self.twitch_api)
        self.redemption_handler.start() # Start background thread for queue processing
        # Prepare UI first, then do background tasks like icon download and auto-connections
        self.init_ui()
        # Prefer bundled icon (assets/icons/app.png) if present, otherwise fall back to downloaded ICON_FILE
        try:
            from pathlib import Path
            assets_icon = Path(__file__).resolve().parent / 'assets' / 'icons' / 'app.png'
            if assets_icon.exists():
                self.setWindowIcon(QIcon(str(assets_icon)))
            elif os.path.exists(ICON_FILE):
                self.setWindowIcon(QIcon(ICON_FILE))
        except Exception:
            if os.path.exists(ICON_FILE):
                self.setWindowIcon(QIcon(ICON_FILE))
        self.apply_global_style()

    def init_ui(self):
        # Application title: simplified to the product name
        self.setWindowTitle('BotOfTheSpecter')
        self.setGeometry(100, 100, 800, 900)
        self.setMinimumSize(700, 800)
        main_layout = QVBoxLayout()
        main_layout.setSpacing(16)
        main_layout.setContentsMargins(16, 16, 16, 16)
        # Header with lock button
        header_layout = QHBoxLayout()
        header_layout.setContentsMargins(0, 0, 0, 0)
        header_layout.setSpacing(0)
        # Version label above on the left (subtle)
        left_section = QVBoxLayout()
        left_section.setContentsMargins(0, 0, 0, 0)
        left_section.setSpacing(2)
        header_label = QLabel('BotOfTheSpecter')
        header_font = QFont()
        header_font.setPointSize(16)
        header_font.setBold(True)
        header_label.setFont(header_font)
        header_label.setStyleSheet("color: #ffffff; background-color: transparent;")
        left_section.addWidget(header_label)
        left_widget = QWidget()
        left_widget.setLayout(left_section)
        header_layout.addWidget(left_widget)
        header_layout.addStretch()
        # Lock/Unlock button
        self.lock_btn = ModernButton("🔓 Unlocked")
        self.lock_btn.setObjectName('lock_btn')
        self.lock_btn.setMaximumWidth(150)
        self.lock_btn.setStyleSheet("""
            QPushButton#lock_btn {
                background-color: #4ec745;
                color: #ffffff;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 11px;
            }
            QPushButton#lock_btn:hover {
                background-color: #5fd855;
            }
            QPushButton#lock_btn:pressed {
                background-color: #3fa536;
            }
        """)
        self.lock_btn.clicked.connect(self.toggle_lock)
        header_layout.addWidget(self.lock_btn)
        main_layout.addLayout(header_layout)
        # Create left sidebar + stacked pages layout
        content_layout = QHBoxLayout()
        content_layout.setSpacing(12)
        content_layout.setContentsMargins(0, 0, 0, 0)
        # Tab 1: Connection Settings
        connection_tab = QWidget()
        connection_layout = QVBoxLayout()
        connection_layout.setSpacing(16)
        connection_layout.setContentsMargins(16, 16, 16, 16)
        # BotOfTheSpecter Group
        bot_group = self._create_bot_group()
        connection_layout.addWidget(bot_group)
        # OBS Group
        obs_group = self._create_obs_group()
        connection_layout.addWidget(obs_group)
        connection_layout.addStretch()
        connection_tab.setLayout(connection_layout)
        # Tab 2: Controls
        controls_tab = QWidget()
        controls_layout = QVBoxLayout()
        controls_layout.setSpacing(16)
        controls_layout.setContentsMargins(16, 16, 16, 16)
        # Scenes Panel
        scenes_group = self._create_scenes_group()
        controls_layout.addWidget(scenes_group)
        controls_layout.addStretch()
        controls_tab.setLayout(controls_layout)
        # Tab 3: Variables
        variables_tab = QWidget()
        variables_layout = QVBoxLayout()
        variables_layout.setSpacing(16)
        variables_layout.setContentsMargins(16, 16, 16, 16)
        # Variables Panel
        variables_group = self._create_variables_group()
        variables_layout.addWidget(variables_group)
        variables_layout.addStretch()
        variables_tab.setLayout(variables_layout)
        # Tab 5: Twitch Channel Points (New)
        self.cp_tab = ChannelPointsTab(self.reward_manager, self.redemption_handler)
        # Tab 4: Event Log
        log_tab = QWidget()
        log_layout = QVBoxLayout()
        log_layout.setSpacing(8)
        log_layout.setContentsMargins(16, 16, 16, 16)
        log_group = ModernGroupBox("Event Log")
        log_inner_layout = QVBoxLayout()
        self.log_area = QTextEdit()
        self.log_area.setObjectName('logArea')
        self.log_area.setReadOnly(True)
        self.log_area.setStyleSheet("""
            QTextEdit {
                background-color: #252525;
                color: #e0e0e0;
                border: 1px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
                font-family: 'Courier New', monospace;
                font-size: 16px;
            }
        """)
        self.log_area.setMinimumHeight(400)
        log_inner_layout.addWidget(self.log_area)
        log_group.setLayout(log_inner_layout)
        log_layout.addWidget(log_group)
        log_tab.setLayout(log_layout)
        # Sidebar
        sidebar = QWidget()
        sidebar.setObjectName('sidebar')
        sidebar.setFixedWidth(180)
        sidebar_layout = QVBoxLayout()
        sidebar_layout.setContentsMargins(8, 8, 8, 8)
        sidebar_layout.setSpacing(8)
        logo_label = QLabel()
        logo_label.setObjectName('sidebarLogo')
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        if os.path.exists(ICON_FILE):
            pix = QPixmap(ICON_FILE).scaled(64, 64, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(pix)
        sidebar_layout.addWidget(logo_label)
        v_label = QLabel(f"v{VERSION}")
        v_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v_label.setObjectName('versionLabel')
        v_label.setProperty('class', 'small')
        sidebar_layout.addWidget(v_label)
        sidebar_layout.addSpacing(6)
        # Navigation buttons
        self.nav_buttons = []
        nav_items = [("⚙️ Connection", connection_tab),
                     ("🎮 Controls", controls_tab),
                     ("📊 Variables", variables_tab),
                     ("🟣 Channel Points", self.cp_tab),
                     ("📋 Event Log", log_tab)]
        # Navigation click handler keeps buttons mutually exclusive and switches pages
        def _on_nav_clicked(i):
            for bi, b in enumerate(self.nav_buttons):
                b.setChecked(bi == i)
            self.pages.setCurrentIndex(i)
            # If switching to Variables page, schedule a short delayed update so the UI
            # can finish the page switch and remain responsive while the tree repopulates.
            if i == 2:
                QTimer.singleShot(10, self.update_variables_display)
        for idx, (label, page_widget) in enumerate(nav_items):
            btn = QPushButton(label)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setCheckable(True)
            btn.setProperty('nav', True)
            btn.clicked.connect(lambda checked, i=idx: _on_nav_clicked(i))
            sidebar_layout.addWidget(btn)
            self.nav_buttons.append(btn)
        sidebar_layout.addStretch()
        sidebar.setLayout(sidebar_layout)
        # Pages area
        self.pages = QStackedWidget()
        self.pages.addWidget(connection_tab)
        self.pages.addWidget(controls_tab)
        self.pages.addWidget(variables_tab)
        self.pages.addWidget(self.cp_tab)
        self.pages.addWidget(log_tab)
        # Default page
        self.pages.setCurrentIndex(0)
        if self.nav_buttons:
            self.nav_buttons[0].setChecked(True)
        content_layout.addWidget(sidebar)
        content_layout.addWidget(self.pages, 1)
        main_layout.addLayout(content_layout)
        self.setLayout(main_layout)
        # Auto-connect if API key exists
        # Defer heavy operations (icon download, auto-connect) to after the UI has shown
        QTimer.singleShot(100, self.post_init_connects)
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
        # Save button for API Key
        self.save_api_btn = ModernButton("Save")
        self.save_api_btn.setMaximumWidth(100)
        self.save_api_btn.clicked.connect(self.save_api_key)
        api_layout.addWidget(self.save_api_btn)
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
        # Streaming Controls Section
        controls_group = ModernGroupBox("Stream Controls")
        controls_layout = QVBoxLayout()
        controls_layout.setSpacing(8)
        # Row 1: Stream and Recording
        row1_layout = QHBoxLayout()
        row1_layout.setSpacing(8)
        self.start_stream_btn = ModernButton("▶ Start Stream")
        self.start_stream_btn.setStyleSheet("""
            QPushButton {
                background-color: #107c10;
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: bold;
                font-size: 11px;
                padding: 10px 16px;
            }
            QPushButton:hover {
                background-color: #128713;
            }
            QPushButton:pressed {
                background-color: #0d6b0d;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #666666;
            }
        """)
        self.start_stream_btn.clicked.connect(self.on_start_stream_clicked)
        self.start_stream_btn.setEnabled(False)
        row1_layout.addWidget(self.start_stream_btn)
        self.start_recording_btn = ModernButton("⏺ Start Recording")
        self.start_recording_btn.setStyleSheet("""
            QPushButton {
                background-color: #c50f1f;
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: bold;
                font-size: 11px;
                padding: 10px 16px;
            }
            QPushButton:hover {
                background-color: #d52030;
            }
            QPushButton:pressed {
                background-color: #a00d18;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #666666;
            }
        """)
        self.start_recording_btn.clicked.connect(self.on_start_recording_clicked)
        self.start_recording_btn.setEnabled(False)
        row1_layout.addWidget(self.start_recording_btn)
        controls_layout.addLayout(row1_layout)
        # Row 2: Replay Buffer and Virtual Cam
        row2_layout = QHBoxLayout()
        row2_layout.setSpacing(8)
        self.save_replay_btn = ModernButton("💾 Save Replay")
        self.save_replay_btn.clicked.connect(self.on_save_replay_clicked)
        self.save_replay_btn.setEnabled(False)
        row2_layout.addWidget(self.save_replay_btn)
        self.toggle_vcam_btn = ModernButton("📹 Virtual Cam: OFF")
        self.toggle_vcam_btn.clicked.connect(self.on_toggle_vcam_clicked)
        self.toggle_vcam_btn.setEnabled(False)
        row2_layout.addWidget(self.toggle_vcam_btn)
        controls_layout.addLayout(row2_layout)
        controls_group.setLayout(controls_layout)
        obs_layout.addWidget(controls_group)
        # Connect Button
        self.obs_connect_btn = ModernStatusButton("Connect")
        self.obs_connect_btn.clicked.connect(self.toggle_obs_connection)
        obs_layout.addWidget(self.obs_connect_btn)
        obs_group.setLayout(obs_layout)
        return obs_group

    def _create_scenes_group(self):
        scenes_group = ModernGroupBox("Scenes")
        scenes_layout = QVBoxLayout()
        scenes_layout.setSpacing(8)
        scenes_layout.setContentsMargins(8, 8, 8, 8)
        # Header with refresh icon, filter, and last-updated timestamp
        header_layout = QHBoxLayout()
        header_layout.setSpacing(10)
        header_layout.setContentsMargins(4, 4, 4, 4)
        # Refresh icon button (compact)
        refresh_icon_btn = QPushButton("")
        refresh_icon_btn.setFixedSize(34, 34)
        try:
            from pathlib import Path
            assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
            rpath = assets_dir / 'refresh.svg'
            if rpath.exists():
                refresh_icon_btn.setIcon(QIcon(str(rpath)))
                refresh_icon_btn.setIconSize(QSize(18, 18))
        except Exception:
            pass
        refresh_icon_btn.setStyleSheet("background-color: #2d2d2d; color: white; border-radius: 17px; border: none;")
        refresh_icon_btn.setToolTip("Refresh Scenes")
        refresh_icon_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        refresh_icon_btn.clicked.connect(self.request_scene_refresh)
        header_layout.addWidget(refresh_icon_btn)
        # Filter field for quick search
        self.scene_filter = ModernLineEdit()
        self.scene_filter.setMinimumWidth(120)
        self.scene_filter.setMaximumWidth(260)  # cap so header buttons have room on smaller windows
        self.scene_filter.setPlaceholderText('Filter scenes or sources...')
        self.scene_filter.textChanged.connect(self.filter_scene_tree)
        # Make the placeholder text readable on dark theme and allow filter to expand/shrink
        base_style = self.scene_filter.styleSheet() or ''
        self.scene_filter.setStyleSheet(base_style + " QLineEdit::placeholder { color: #aaaaaa; } QLineEdit:placeholder { color: #aaaaaa; }")
        self.scene_filter.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        header_layout.addWidget(self.scene_filter, 1)
        # Quick action buttons: group into a compact container to avoid layout overlap
        btn_container = QWidget()
        btn_container.setFixedWidth(230)  # reserve fixed space so buttons never overlap the filter
        btn_container.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        btn_layout = QHBoxLayout(btn_container)
        btn_layout.setContentsMargins(0, 0, 0, 0)
        btn_layout.setSpacing(8)
        self.show_scene_btn = QPushButton('Show')
        self.show_scene_btn.setFixedSize(68, 28)
        self.show_scene_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.show_scene_btn.setToolTip('Show all sources in the selected scene')
        self.show_scene_btn.clicked.connect(self._on_show_scene_clicked)
        self.show_scene_btn.setEnabled(False)
        btn_layout.addWidget(self.show_scene_btn)
        self.hide_scene_btn = QPushButton('Hide')
        self.hide_scene_btn.setFixedSize(68, 28)
        self.hide_scene_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.hide_scene_btn.setToolTip('Hide all sources in the selected scene')
        self.hide_scene_btn.clicked.connect(self._on_hide_scene_clicked)
        self.hide_scene_btn.setEnabled(False)
        btn_layout.addWidget(self.hide_scene_btn)
        self.set_scene_btn = QPushButton('Set Scene')
        self.set_scene_btn.setFixedSize(84, 28)
        self.set_scene_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.set_scene_btn.setToolTip('Set the selected scene as the current scene in OBS')
        self.set_scene_btn.clicked.connect(self._on_set_scene_clicked)
        self.set_scene_btn.setEnabled(False)
        btn_layout.addWidget(self.set_scene_btn)
        header_layout.addWidget(btn_container)
        header_layout.addStretch()
        scenes_layout.addLayout(header_layout)
        info_label = QLabel("Double-click a source to toggle visibility")
        info_label.setStyleSheet("color:#aaaaaa; font-size:10px; padding-left:6px; margin-top:4px;")
        scenes_layout.addWidget(info_label)
        # Tree view for scenes and sources (now with Status column)
        self.scene_tree = QTreeWidget()
        self.scene_tree.setColumnCount(2)
        self.scene_tree.setHeaderLabels(["Scenes and Sources", "Status"])
        self.scene_tree.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.scene_tree.header().setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        # Narrow the status column so controls remain compact
        self.scene_tree.header().resizeSection(1, 64)
        self.scene_tree.setStyleSheet("""
            QTreeWidget {
                background-color: #252525;
                color: #e0e0e0;
                alternate-background-color: #2b2b2b;
                border: 1px solid #3d3d3d;
                border-radius: 8px;
                padding: 12px;
                font-size: 11px;
            }
            QTreeWidget::item {
                padding: 10px 8px; /* vertical padding increased for breathing room */
                background-color: transparent;
                color: #e0e0e0;
            }
            QTreeWidget::item:alternate { background-color: #2b2b2b; }
            /* Header section styling to prevent the white bar */
            QHeaderView::section {
                background-color: #2b2b2b;
                color: #e0e0e0;
                padding: 6px;
                border: none;
                font-weight: bold;
            }
            QTreeWidget::item:selected { background: #3d3d3d; color: #ffffff; }
            QTreeWidget::item:hover { background: #333333; }
            /* Subtle vertical scrollbar styling */
            QScrollBar:vertical {
                background: transparent;
                width: 10px;
            }
            QScrollBar::handle:vertical {
                background: rgba(255,255,255,0.08);
                min-height: 24px;
                border-radius: 6px;
            }
            QScrollBar::add-line, QScrollBar::sub-line { height: 0; }
            QScrollBar::add-page, QScrollBar::sub-page { background: none; }
        """)
        # Make the scenes box taller to better use available space
        self.scene_tree.setMinimumHeight(480)
        # Allow the tree to expand to a larger height (use layout space)
        try:
            self.scene_tree.setMaximumHeight(900)
        except Exception:
            pass
        self.scene_tree.setAlternatingRowColors(True)
        # Make header a bit shorter and ensure consistent header styling to avoid layout artifacts
        self.scene_tree.header().setFixedHeight(28)
        try:
            self.scene_tree.header().setDefaultAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        except Exception:
            pass
        # Improve indentation for child source items
        try:
            self.scene_tree.setIndentation(16)
        except Exception:
            pass
        self.scene_tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.scene_tree.customContextMenuRequested.connect(self.scene_tree_context_menu)
        self.scene_tree.itemDoubleClicked.connect(self.on_scene_item_double_clicked)
        # Selection changes enable/disable the header action buttons
        self.scene_tree.itemSelectionChanged.connect(self._on_scene_selection_changed)
        scenes_layout.addWidget(self.scene_tree)
        # Bottom bar with timestamp (right-aligned)
        bottom_layout = QHBoxLayout()
        bottom_layout.setContentsMargins(8, 6, 8, 0)
        bottom_layout.addStretch()
        self.scenes_last_updated_label = QLabel("Last updated: Never")
        self.scenes_last_updated_label.setStyleSheet("color: #9a9a9a; font-size:9px;")
        self.scenes_last_updated_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        bottom_layout.addWidget(self.scenes_last_updated_label)
        scenes_layout.addLayout(bottom_layout)
        scenes_group.setLayout(scenes_layout)
        return scenes_group

    def _create_variables_group(self):
        variables_group = ModernGroupBox("Variables")
        variables_layout = QVBoxLayout()
        variables_layout.setSpacing(8)
        # Header with filter
        header_layout = QHBoxLayout()
        header_layout.setSpacing(8)
        # Filter field
        self.variables_filter = ModernLineEdit()
        self.variables_filter.setMaximumWidth(220)
        self.variables_filter.setPlaceholderText('Filter variables...')
        self.variables_filter.textChanged.connect(self.filter_variables_table)
        base_style = self.variables_filter.styleSheet() or ''
        self.variables_filter.setStyleSheet(base_style + " QLineEdit::placeholder { color: #aaaaaa; }")
        header_layout.addWidget(self.variables_filter)
        header_layout.addStretch()
        variables_layout.addLayout(header_layout)
        info_label = QLabel("📊 Real-time event data captured from BotOfTheSpecter")
        info_label.setStyleSheet("color:#aaaaaa; font-size:10px; padding-left:6px;")
        variables_layout.addWidget(info_label)
        # Tree view for variables
        self.variables_tree = QTreeWidget()
        self.variables_tree.setHeaderLabels(["Variable", "Value"])
        self.variables_tree.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Interactive)
        self.variables_tree.header().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.variables_tree.setStyleSheet("""
            QTreeWidget {
                background-color: #252525;
                color: #e0e0e0;
                alternate-background-color: #2b2b2b;
                border: 1px solid #3d3d3d;
                border-radius: 4px;
                padding: 8px;
                font-size: 11px;
            }
            QTreeWidget::item {
                padding: 4px 8px;
                background-color: transparent;
                color: #e0e0e0;
            }
            QTreeWidget::item:alternate { background-color: #2b2b2b; }
            QHeaderView::section {
                background-color: #2b2b2b;
                color: #e0e0e0;
                padding: 6px;
                border: none;
                font-weight: bold;
            }
            QTreeWidget::item:selected { background: #3d3d3d; color: #ffffff; }
            QTreeWidget::item:hover { background: #333333; }
        """)
        # Make the variables viewer taller by default and allow it to expand
        self.variables_tree.setMinimumHeight(400)
        self.variables_tree.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.variables_tree.setAlternatingRowColors(True)
        self.variables_tree.header().setFixedHeight(28)
        self.variables_tree.setColumnWidth(0, 200)
        variables_layout.addWidget(self.variables_tree)
        # Info label
        self.variables_count_label = QLabel("Variables: 0 | Counters: 0")
        self.variables_count_label.setStyleSheet("color:#aaaaaa; font-size:10px; padding-left:6px;")
        variables_layout.addWidget(self.variables_count_label)
        variables_group.setLayout(variables_layout)
        # Set up variable manager listener
        self.variable_manager.add_listener(self.on_variable_changed)
        # Initial population
        self.update_variables_display()
        return variables_group

    def on_variable_changed(self, action, name, new_value, old_value):
        # Coalesce rapid updates to avoid blocking the UI when many events arrive.
        try:
            if not hasattr(self, '_variables_update_timer'):
                self._variables_update_timer = QTimer(self)
                self._variables_update_timer.setSingleShot(True)
                self._variables_update_timer.timeout.connect(self.update_variables_display)
            # Restart timer; short delay allows multiple changes to be grouped
            self._variables_update_timer.start(50)
        except Exception:
            # Fallback - update immediately if timer creation fails
            self.update_variables_display()

    def update_variables_display(self):
        if not hasattr(self, 'variables_tree'):
            return
        # Populate the tree efficiently to avoid UI freezes when many variables exist.
        try:
            self.variables_tree.setSortingEnabled(False)
        except Exception:
            pass
        try:
            self.variables_tree.setUpdatesEnabled(False)
        except Exception:
            pass
        try:
            self.variables_tree.blockSignals(True)
        except Exception:
            pass
        try:
            self.variables_tree.clear()
            # Get all variables
            all_vars = self.variable_manager.get_all_variables()
            counter_count = len(self.variable_manager.counters)
            # Variables shown in the list include defaults and counters; compute
            # the displayed variables count as total displayed items minus counters
            total_displayed = len(all_vars)
            var_count = max(0, total_displayed - counter_count)
            # Update count label to reflect what's actually visible
            if hasattr(self, 'variables_count_label'):
                self.variables_count_label.setText(f"Variables: {var_count} | Counters: {counter_count}")
            # Add items without using the constructor that takes parent on every item (faster)
            names = sorted(all_vars.keys())
            for name in names:
                value = all_vars[name]
                item = QTreeWidgetItem()
                item.setText(0, name)
                item.setText(1, str(value))
                # Different styling for counters
                if name in self.variable_manager.counters:
                    try:
                        font = item.font(0)
                        font.setBold(True)
                        item.setFont(0, font)
                        item.setToolTip(0, "Counter variable")
                    except Exception:
                        pass
                else:
                    item.setToolTip(0, "Regular variable")
                self.variables_tree.addTopLevelItem(item)
        finally:
            # Restore UI state
            try:
                self.variables_tree.blockSignals(False)
            except Exception:
                pass
            try:
                self.variables_tree.setUpdatesEnabled(True)
            except Exception:
                pass
            try:
                self.variables_tree.setSortingEnabled(True)
            except Exception:
                pass

    def filter_variables_table(self):
        filter_text = self.variables_filter.text().lower()
        for i in range(self.variables_tree.topLevelItemCount()):
            item = self.variables_tree.topLevelItem(i)
            visible = filter_text in item.text(0).lower() or filter_text in item.text(1).lower()
            item.setHidden(not visible)

    def validate_api_key(self):
        # Backwards compatibility: keep existing method name for any external calls
        # Delegate to the new save_api_key implementation
        self.save_api_key()

    def save_api_key(self):
        api_key = self.api_key_input.text().strip()
        if not api_key:
            QMessageBox.warning(self, "Save API Key", "Please enter an API key before saving.")
            return
        # Validate key before persisting
        is_valid = False
        username = None
        message = "Invalid API key"
        if self.twitch_api:
            try:
                is_valid, username, message = self.twitch_api.validate_api_key(api_key)
            except Exception:
                is_valid, username, message = False, None, "Unable to validate API key"
        if not is_valid:
            QMessageBox.warning(self, "Save API Key", f"API Key validation failed: {message}")
            self.bot_connect_btn.setEnabled(False)
            return
        # Persist the key and enable connection controls
        self.config.set('api_key', api_key)
        channel_text = username or "Unknown"
        QMessageBox.information(
            self,
            "Save API Key",
            f"API Key is valid for channel: {channel_text}.\nAPI Key saved. Click Connect to start the Bot connection."
        )
        self.bot_connect_btn.setEnabled(True)
        # Update Twitch API if present
        if self.twitch_api:
            try:
                self.twitch_api.set_api_key(api_key)
            except Exception:
                pass
        # Note: Channel Points are loaded on application launch. Use 'Sync from Twitch' to update rewards manually.
    def toggle_lock(self):
        self.is_locked = not self.is_locked
        if self.is_locked:
            self.lock_btn.setText("🔒 Locked")
            self.lock_btn.setStyleSheet("""
                QPushButton#lock_btn {
                    background-color: #f55047;
                    color: #ffffff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 11px;
                }
                QPushButton#lock_btn:hover {
                    background-color: #ff6655;
                }
                QPushButton#lock_btn:pressed {
                    background-color: #e03f3f;
                }
            """)
            self.log_event("🔒 Control Panel LOCKED - OBS commands will be ignored")
        else:
            self.lock_btn.setText("🔓 Unlocked")
            self.lock_btn.setStyleSheet("""
                QPushButton#lock_btn {
                    background-color: #4ec745;
                    color: #ffffff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 11px;
                }
                QPushButton#lock_btn:hover {
                    background-color: #5fd855;
                }
                QPushButton#lock_btn:pressed {
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
        api_key = self.api_key_input.text().strip()
        if not api_key:
            QMessageBox.warning(self, "Connection Error", "Please enter an API key first.")
            return
        # Validate key before connecting websocket
        is_valid = False
        username = None
        message = "Invalid API key"
        if self.twitch_api:
            try:
                is_valid, username, message = self.twitch_api.validate_api_key(api_key)
            except Exception:
                is_valid, username, message = False, None, "Unable to validate API key"
        if not is_valid:
            QMessageBox.warning(self, "Connection Error", f"API Key validation failed: {message}")
            return
        if username:
            bot_logger.info(f"API key validated for channel: {username}")
            
        # Update Twitch API Key just in case it changed
        if self.twitch_api:
             self.twitch_api.set_api_key(api_key)
             
        self.bot_connector = BotOfTheSpecterConnector(
            api_key, 
            self.obs_connector, 
            main_window=self, 
            variable_manager=self.variable_manager,
            redemption_handler=self.redemption_handler
        )
        self.bot_connector.status_update.connect(self.update_bot_status)
        self.bot_connector.event_received.connect(self.log_event)
        self.bot_connector.start()
        self.bot_connect_btn.setText("Disconnect")
    def disconnect_bot(self):
        try:
            if self.bot_connector:
                self.bot_connector.disconnect()
                if self.bot_connector.isRunning():
                    self.bot_connector.wait(5000)
                self.bot_connect_btn.setText("Connect")
                # Stop status refresh timer to prevent crashes during disconnect
                self.status_timer.stop()
                # Update status to show disconnected
                self.update_bot_status("Disconnected from BotOfTheSpecter")
        except Exception as e:
            bot_logger.error(f"Error disconnecting bot: {e}")
            self.bot_connect_btn.setText("Connect")
            self.status_timer.stop()
            self.update_bot_status("Disconnected from BotOfTheSpecter")
    def connect_obs(self):
        if self.obs_connector and self.obs_connector.isRunning():
            self.obs_connector.should_stop = False
            self.obs_connect_btn.setText("Disconnect")
            # Start status refresh timer (if not already running)
            if not self.status_timer.isActive():
                self.status_timer.start(1000)  # Refresh every 1000ms
            return
        # Additional handler to revert optimistic UI toggles when action fails
        try:
            self.obs_connector.event_received.connect(self._on_obs_event_for_revert)
        except Exception:
            pass
        host = self.obs_host.text()
        port = int(self.obs_port.text())
        password = self.obs_password.text()
        self.config.set('obs_host', host)
        self.config.set('obs_port', port)
        self.config.set('obs_password', password)
        self.obs_connector = OBSConnector(host, port, password, self.bot_connector)
        if self.bot_connector:
            self.bot_connector.set_obs_connector(self.obs_connector)
        
        # Update handler with new connector
        if self.redemption_handler:
            self.redemption_handler.set_obs_connector(self.obs_connector)
        self.obs_connector.status_update.connect(self.update_obs_status)
        self.obs_connector.event_received.connect(self.log_event)
        self.obs_connector.stats_update.connect(self.handle_stats_update)
        # Connect to scenes updates
        try:
            self.obs_connector.scenes_updated.connect(self.update_scene_tree)
        except Exception:
            pass
        self.obs_connector.start()
        self.obs_connect_btn.setText("Disconnect")
        # Enable streaming control buttons when connected
        self.start_stream_btn.setEnabled(True)
        self.start_recording_btn.setEnabled(True)
        self.save_replay_btn.setEnabled(True)
        self.toggle_vcam_btn.setEnabled(True)
        # Start status refresh timer (if not already running)
        if not self.status_timer.isActive():
            self.status_timer.start(1000)  # Refresh every 1000ms
        # Don't call prerequest precache here; the OBS connector will precache on successful connect.
        # No blocking UI polling - OBSConnector emits status updates via stats_update
    def post_init_connects(self):
        # Download icon in a background thread if missing to avoid UI freeze
        try:
            import threading
            if not os.path.exists(ICON_FILE):
                t = threading.Thread(target=download_icon, daemon=True)
                t.start()
        except Exception:
            pass
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
        # Attempt an initial Channel Points refresh shortly after startup
        try:
            self.cp_tab.startup_refresh_completed.connect(lambda: QTimer.singleShot(100, lambda: self.redemption_handler.trigger_poll()))
        except Exception:
            pass
        QTimer.singleShot(1500, lambda: self.cp_tab.schedule_refresh(startup=True))
    def toggle_obs_connection(self):
        if self.obs_connect_btn.text() == "Connect":
            self.connect_obs()
        else:
            self.disconnect_obs()
    def disconnect_obs(self):
        try:
            if self.obs_connector:
                # Request a non-blocking graceful disconnect
                self.obs_connector.disconnect()
                # Connect a one-shot handler to finalize UI when the thread finishes
                try:
                    self.obs_connector.finished.connect(self._on_obs_disconnected_cleanup)
                except Exception:
                    pass
                # Fallback: ensure cleanup happens after 5s even if finished isn't emitted
                QTimer.singleShot(5000, self._on_obs_disconnected_cleanup)
        except Exception as e:
            bot_logger.error(f"Error disconnecting OBS: {e}")
            # Ensure UI state still reflects disconnected
            self._on_obs_disconnected_cleanup()
    def _on_obs_disconnected_cleanup(self):
        # This may be called multiple times; guard against partial state
        try:
            self.obs_connect_btn.setText("Connect")
            # Disable streaming control buttons
            if hasattr(self, 'start_stream_btn'):
                self.start_stream_btn.setEnabled(False)
                self.start_stream_btn.setText("▶ Start Stream")
            if hasattr(self, 'start_recording_btn'):
                self.start_recording_btn.setEnabled(False)
                self.start_recording_btn.setText("⏺ Start Recording")
            if hasattr(self, 'save_replay_btn'):
                self.save_replay_btn.setEnabled(False)
            if hasattr(self, 'toggle_vcam_btn'):
                self.toggle_vcam_btn.setEnabled(False)
                self.toggle_vcam_btn.setText("📹 Virtual Cam: OFF")
            # Stop status refresh timer
            self.status_timer.stop()
            # Update status to show disconnected
            self.update_obs_status("Disconnected from OBS")
            # Clear scenes tree since we are disconnected
            try:
                if hasattr(self, 'scene_tree'):
                    self.scene_tree.clear()
            except Exception:
                pass
        except Exception as e:
            bot_logger.error(f"Error during OBS disconnect cleanup: {e}")
    def refresh_status(self):
        # Periodic UI status refresh is now handled by the OBSConnector.stats_update signal.
        # Keep this function as a no-op fallback for older behavior.
        return
    def update_scene_tree(self, scenes_dict):
        try:
            # Preserve UI state so updates don't disrupt scrolling or selection
            prev_scroll = None
            expanded_scenes = set()
            selected_item_data = None
            try:
                vbar = self.scene_tree.verticalScrollBar()
                prev_scroll = vbar.value()
            except Exception:
                prev_scroll = None
            try:
                for i in range(self.scene_tree.topLevelItemCount()):
                    top = self.scene_tree.topLevelItem(i)
                    if top.isExpanded():
                        expanded_scenes.add(top.text(0))
            except Exception:
                pass
            try:
                sel = self.scene_tree.selectedItems()
                if sel:
                    s = sel[0]
                    d = s.data(0, Qt.ItemDataRole.UserRole)
                    if d:
                        selected_item_data = (d[0], d[1])
            except Exception:
                selected_item_data = None
            # Rebuild the tree
            self.scene_tree.clear()
            if not scenes_dict:
                return
            # Sort scene names for stable order
            for scene_name in sorted(scenes_dict.keys()):
                scene_item = QTreeWidgetItem(self.scene_tree)
                scene_item.setText(0, scene_name)
                # Bold font for scene items
                font = scene_item.font(0)
                font.setBold(True)
                scene_item.setFont(0, font)
                for src in scenes_dict.get(scene_name, []):
                    child = QTreeWidgetItem(scene_item)
                    # Build a left-cell widget containing a compact indicator and the source name
                    try:
                        cell = QWidget()
                        # Make the embedded cell transparent so the tree's row background shows through
                        cell.setStyleSheet("background-color: transparent;")
                        cl = QHBoxLayout(cell)
                        cl.setContentsMargins(6, 0, 6, 0)
                        cl.setSpacing(8)
                        cl.setAlignment(Qt.AlignmentFlag.AlignVCenter)
                        # compact clickable indicator
                        ind_btn = QPushButton()
                        ind_btn.setFixedSize(12, 12)
                        color = '#4ec745' if src.get('enabled') else '#777777'
                        ind_btn.setStyleSheet(f"""QPushButton {{ background-color: {color}; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); padding: 0; }} QPushButton:hover {{ outline: 2px solid rgba(255,255,255,0.06); }}""")
                        ind_btn.setCursor(Qt.CursorShape.PointingHandCursor)
                        ind_btn.setToolTip('Visible' if src.get('enabled') else 'Hidden')
                        ind_btn._scene_name = scene_name
                        ind_btn._item_id = src.get('id')
                        ind_btn._enabled = src.get('enabled')
                        ind_btn.clicked.connect(lambda _, b=ind_btn: self._toggle_source_from_button(b))
                        cl.addWidget(ind_btn)
                        # name label next to the indicator (transparent background)
                        name_lbl = QLabel(src.get('name', f"Item {src.get('id')}"))
                        name_lbl.setStyleSheet("color: #e0e0e0; background-color: transparent;")
                        name_font = name_lbl.font()
                        name_font.setPointSize(10)
                        name_lbl.setFont(name_font)
                        name_lbl.setToolTip(f"ID: {src.get('id')} | Enabled: {src.get('enabled')}")
                        cl.addWidget(name_lbl)
                        cl.addStretch()
                        # Set the user data on the item (used for toggles)
                        child.setData(0, Qt.ItemDataRole.UserRole, (scene_name, src.get('id'), src.get('enabled')))
                        child.setText(1, '')
                        # Place the composite widget in column 0 (left)
                        self.scene_tree.setItemWidget(child, 0, cell)
                        # Forward right-clicks on the embedded widgets to the tree context menu
                        try:
                            cell.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                            cell.customContextMenuRequested.connect(lambda p, w=cell: self._forward_context_menu_from_widget(w, p))
                            ind_btn.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                            ind_btn.customContextMenuRequested.connect(lambda p, w=ind_btn: self._forward_context_menu_from_widget(w, p))
                            name_lbl.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                            name_lbl.customContextMenuRequested.connect(lambda p, w=name_lbl: self._forward_context_menu_from_widget(w, p))
                        except Exception:
                            pass
                    except Exception:
                        # fallback to a simple text status in the right column
                        child.setText(0, src.get('name', f"Item {src.get('id')}"))
                        child.setText(1, 'Visible' if src.get('enabled') else 'Hidden')
            # Restore expansion state (or expand by default) and update counts
            for i in range(self.scene_tree.topLevelItemCount()):
                try:
                    top = self.scene_tree.topLevelItem(i)
                    # Restore expansion if we recorded one, otherwise expand
                    if expanded_scenes:
                        top.setExpanded(top.text(0) in expanded_scenes)
                    else:
                        top.setExpanded(True)
                    count = top.childCount()
                    top.setText(1, f"{count} sources")
                except Exception:
                    pass
            # Restore scroll position and selection if possible
            try:
                vbar = self.scene_tree.verticalScrollBar()
                if prev_scroll is not None:
                    vbar.setValue(min(prev_scroll, vbar.maximum()))
            except Exception:
                pass
            try:
                if selected_item_data:
                    s_scene, s_id = selected_item_data
                    found = False
                    for i in range(self.scene_tree.topLevelItemCount()):
                        top = self.scene_tree.topLevelItem(i)
                        for j in range(top.childCount()):
                            child = top.child(j)
                            d = child.data(0, Qt.ItemDataRole.UserRole)
                            if d and d[0] == s_scene and d[1] == s_id:
                                child.setSelected(True)
                                self.scene_tree.scrollToItem(child, QTreeWidget.PositionAtCenter)
                                found = True
                                break
                        if found:
                            break
            except Exception:
                pass
            # Update header action button availability after tree rebuild
            try:
                self._on_scene_selection_changed()
            except Exception:
                pass
            try:
                import datetime
                ts = 'Last updated: ' + datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                try:
                    self.scenes_last_updated_label.setText(ts)
                except Exception:
                    pass
            except Exception:
                pass
        except Exception as e:
            bot_logger.error(f"Failed to update scene tree: {e}")
    def handle_stats_update(self, status):
        try:
            combined_status = {
                'streaming': status.get('streaming', False),
                'recording': status.get('recording', False),
                'replay_buffer': status.get('replay_buffer', False),
                'stream_bitrate': status.get('stream_bitrate', 0),
                'record_bitrate': status.get('record_bitrate', 0)
            }
            self.status_panel.update_status(combined_status)
        except Exception as e:
            bot_logger.error(f"Error updating status panel from stats_update: {e}")
    def request_scene_refresh(self):
        if not self.obs_connector:
            QMessageBox.warning(self, "Refresh Scenes", "No OBS connector available.")
            return
        if not self.obs_connector.connected:
            QMessageBox.warning(self, "Refresh Scenes", "OBS is not connected.")
            return
        try:
            # Provide immediate feedback by showing a small loading style on the refresh label
            try:
                self.scenes_last_updated_label.setText('Refreshing...')
            except Exception:
                pass
            self.obs_connector.refresh_requested.emit()
        except Exception as e:
            websocket_logger.error(f"Failed to request scenes refresh: {e}")
    def _build_status_dot(self, enabled):
        try:
            size = QSize(12, 12)
            pix = QPixmap(size)
            pix.fill(QColor(0, 0, 0, 0))
            p = QPainter(pix)
            color = QColor('#4ec745') if enabled else QColor('#777777')
            p.setBrush(color)
            p.setPen(Qt.GlobalColor.transparent)
            radius = 5
            center_x = size.width() // 2
            center_y = size.height() // 2
            p.drawEllipse(center_x - radius//2, center_y - radius//2, radius, radius)
            p.end()
            return pix
        except Exception as e:
            bot_logger.debug(f"Failed to build status dot: {e}")
            return QPixmap()
            p.drawEllipse(center_x - radius, center_y - radius, radius * 2, radius * 2)
            p.end()
            return QIcon(pix)
        except Exception:
            return QIcon()
    def filter_scene_tree(self, text):
        try:
            if not text:
                for i in range(self.scene_tree.topLevelItemCount()):
                    scene_item = self.scene_tree.topLevelItem(i)
                    scene_item.setHidden(False)
                    for j in range(scene_item.childCount()):
                        scene_item.child(j).setHidden(False)
                return
            text = text.lower()
            for i in range(self.scene_tree.topLevelItemCount()):
                scene_item = self.scene_tree.topLevelItem(i)
                scene_match = text in scene_item.text(0).lower()
                any_child_visible = False
                for j in range(scene_item.childCount()):
                    child = scene_item.child(j)
                    child_match = text in child.text(0).lower()
                    child.setHidden(not child_match)
                    if child_match:
                        any_child_visible = True
                scene_item.setHidden(not (scene_match or any_child_visible))
        except Exception as e:
            bot_logger.error(f"Error filtering scene tree: {e}")
    def scene_tree_context_menu(self, pos):
        try:
            item = self.scene_tree.itemAt(pos)
            if item is None:
                return
            menu = QMenu(self.scene_tree)
            is_top_level = item.parent() is None
            if is_top_level:
                # Set as current scene
                set_scene_action = QAction('Set as Current Scene', self.scene_tree)
                set_scene_action.triggered.connect(lambda: self._context_set_current_scene(item.text(0)))
                menu.addAction(set_scene_action)
                # Bulk actions for scenes
                show_all = QAction('Show All Sources', self.scene_tree)
                show_all.triggered.connect(lambda: self._context_set_scene_sources(item.text(0), True))
                hide_all = QAction('Hide All Sources', self.scene_tree)
                hide_all.triggered.connect(lambda: self._context_set_scene_sources(item.text(0), False))
                menu.addAction(show_all)
                menu.addAction(hide_all)
            else:
                data = item.data(0, Qt.ItemDataRole.UserRole)
                if data:
                    scene_name, item_id, enabled = data
                    # Provide explicit Show/Hide in addition to Toggle
                    show_action = QAction('Show Source', self.scene_tree)
                    show_action.triggered.connect(lambda: self._context_set_source_enabled(scene_name, item_id, True))
                    hide_action = QAction('Hide Source', self.scene_tree)
                    hide_action.triggered.connect(lambda: self._context_set_source_enabled(scene_name, item_id, False))
                    toggle_action = QAction('Toggle Visibility', self.scene_tree)
                    toggle_action.triggered.connect(lambda: self._context_toggle_source(scene_name, item_id, enabled))
                    # Add actions, disabling the redundant one
                    if enabled:
                        show_action.setEnabled(False)
                    else:
                        hide_action.setEnabled(False)
                    menu.addAction(show_action)
                    menu.addAction(hide_action)
                    menu.addAction(toggle_action)
            menu.addAction(QAction('Refresh Scenes', self.scene_tree, triggered=self.request_scene_refresh))
            menu.exec(self.scene_tree.viewport().mapToGlobal(pos))
        except Exception as e:
            bot_logger.error(f"Error building scene context menu: {e}")
    def _context_set_current_scene(self, scene_name):
        if not self.obs_connector or not self.obs_connector.connected:
            QMessageBox.warning(self, "Set Scene", "OBS is not connected.")
            return
        if not self.obs_connector.isRunning():
            websocket_logger.warning("OBS connector thread not running; attempting to start it...")
            try:
                self.obs_connector.start()
            except Exception as e:
                websocket_logger.error(f"Failed to start OBS connector thread: {e}")
                QMessageBox.warning(self, "Set Scene", "OBS connector thread was not running and failed to start.")
                return
        try:
            action = {'action': 'set_current_scene', 'scene': scene_name}
            self.obs_connector.action_requested.emit(action)
            self.log_event(f"Requested set current scene: {scene_name}")
        except Exception as e:
            websocket_logger.error(f"Failed to set current scene: {e}")
            QMessageBox.warning(self, "Set Scene", "Failed to request set-scene action; please try again.")
    def _on_scene_selection_changed(self):
        try:
            sel = self.scene_tree.selectedItems()
            if not sel:
                self.show_scene_btn.setEnabled(False)
                self.hide_scene_btn.setEnabled(False)
                self.set_scene_btn.setEnabled(False)
                return
            item = sel[0]
            if item.parent() is None:
                # top-level scene selected
                self.show_scene_btn.setEnabled(True)
                self.hide_scene_btn.setEnabled(True)
                self.set_scene_btn.setEnabled(True)
            else:
                # child source selected - enable per-source show/hide via context menu
                self.show_scene_btn.setEnabled(False)
                self.hide_scene_btn.setEnabled(False)
                self.set_scene_btn.setEnabled(False)
        except Exception as e:
            bot_logger.error(f"Error updating scene selection buttons: {e}")
    def _context_toggle_source(self, scene_name, item_id, enabled):
        # Toggle the source's enabled state (convenience wrapper)
        self._context_set_source_enabled(scene_name, item_id, not enabled)
    def _context_set_source_enabled(self, scene_name, item_id, enabled):
        if not self.obs_connector or not self.obs_connector.connected:
            QMessageBox.warning(self, "Toggle Source", "OBS is not connected.")
            return
        if not self.obs_connector.isRunning():
            websocket_logger.warning("OBS connector thread not running; attempting to start it...")
            try:
                self.obs_connector.start()
            except Exception as e:
                websocket_logger.error(f"Failed to start OBS connector thread: {e}")
                QMessageBox.warning(self, "Toggle Source", "OBS connector thread was not running and failed to start.")
                return
        # Send the action to OBS connector
        action = {
            'action': 'set_scene_item_enabled',
            'scene': scene_name,
            'item_id': item_id,
            'enabled': enabled
        }
        try:
            self.obs_connector.action_requested.emit(action)
            # Optimistic UI update: update item data and indicator immediately
            try:
                for i in range(self.scene_tree.topLevelItemCount()):
                    top = self.scene_tree.topLevelItem(i)
                    if top.text(0) != scene_name:
                        continue
                    for j in range(top.childCount()):
                        child = top.child(j)
                        data = child.data(0, Qt.ItemDataRole.UserRole)
                        if data and data[1] == item_id:
                            # update cached flag
                            child.setData(0, Qt.ItemDataRole.UserRole, (data[0], data[1], enabled))
                            # Update widget in column 0 if present
                            w = self.scene_tree.itemWidget(child, 0)
                            if w:
                                btn = w.findChild(QPushButton)
                                if btn:
                                    bg = '#4ec745' if enabled else '#777777'
                                    try:
                                        btn.setStyleSheet(f"""QPushButton {{ background-color: {bg}; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); padding: 0; }} QPushButton:hover {{ outline: 2px solid rgba(255,255,255,0.06); }}""")
                                        btn.setToolTip('Visible' if enabled else 'Hidden')
                                    except Exception:
                                        pass
                            # ensure text label adjusted (no emoji/markers)
                            try:
                                # If label exists in widget, keep its text; no adornment needed
                                pass
                            except Exception:
                                pass
                            break
            except Exception:
                pass
            self.log_event(f"Requested action: {action}")
        except Exception as e:
            websocket_logger.error(f"Failed to request action via signal: {e}")
            QMessageBox.warning(self, "Action Error", "Failed to request OBS action; please try again.")
        # Refresh scenes to reflect change by signaling the connector thread
        try:
            self.obs_connector.refresh_requested.emit()
        except Exception as e:
            websocket_logger.error(f"Failed to request scenes refresh via signal: {e}")
    def _context_set_scene_sources(self, scene_name, enabled):
        try:
            for i in range(self.scene_tree.topLevelItemCount()):
                top = self.scene_tree.topLevelItem(i)
                if top.text(0) != scene_name:
                    continue
                for j in range(top.childCount()):
                    child = top.child(j)
                    data = child.data(0, Qt.ItemDataRole.UserRole)
                    if data:
                        _, item_id, _ = data
                        # Reuse the existing setter to preserve checks and optimistic UI updates
                        self._context_set_source_enabled(scene_name, item_id, enabled)
            self.log_event(f"Requested {'Show' if enabled else 'Hide'} all sources in scene {scene_name}")
        except Exception as e:
            websocket_logger.error(f"Failed to set scene sources: {e}")
    def _on_show_scene_clicked(self):
        try:
            sel = self.scene_tree.selectedItems()
            if not sel:
                return
            item = sel[0]
            if item.parent() is None:
                self._context_set_scene_sources(item.text(0), True)
        except Exception as e:
            bot_logger.error(f"Error in show scene clicked: {e}")
    def _on_hide_scene_clicked(self):
        try:
            sel = self.scene_tree.selectedItems()
            if not sel:
                return
            item = sel[0]
            if item.parent() is None:
                self._context_set_scene_sources(item.text(0), False)
        except Exception as e:
            bot_logger.error(f"Error in hide scene clicked: {e}")
    def _on_set_scene_clicked(self):
        try:
            sel = self.scene_tree.selectedItems()
            if not sel:
                return
            item = sel[0]
            if item.parent() is None:
                self._context_set_current_scene(item.text(0))
        except Exception as e:
            bot_logger.error(f"Error in set scene clicked: {e}")
    def _toggle_source_from_button(self, button):
        try:
            scene_name = getattr(button, '_scene_name', None)
            item_id = getattr(button, '_item_id', None)
            if scene_name is None or item_id is None:
                return
            # Find the corresponding tree item to read current state
            enabled = None
            for i in range(self.scene_tree.topLevelItemCount()):
                top = self.scene_tree.topLevelItem(i)
                for j in range(top.childCount()):
                    child = top.child(j)
                    data = child.data(0, Qt.ItemDataRole.UserRole)
                    if data and data[0] == scene_name and data[1] == item_id:
                        enabled = data[2]
                        # Use the existing context toggle flow which also handles thread checks
                        self._context_set_source_enabled(scene_name, item_id, not enabled)
                        return
        except Exception as e:
            bot_logger.error(f"Error toggling source from button: {e}")
        # If we get here it means the OBS connector thread may not be running; try to start it
        try:
            if not self.obs_connector.isRunning():
                websocket_logger.warning("OBS connector thread not running; attempting to start it...")
                self.obs_connector.start()
        except Exception as e:
            websocket_logger.error(f"Failed to start OBS connector thread: {e}")
            QMessageBox.warning(self, "Toggle Source", "OBS connector thread was not running and failed to start.")
            return
        action = {'action': 'set_scene_item_enabled', 'scene': scene_name, 'item_id': item_id, 'enabled': not enabled}
        try:
            self.obs_connector.action_requested.emit(action)
            self.log_event(f"Requested action: {action}")
        except Exception as e:
            websocket_logger.error(f"Failed to request action via signal: {e}")
            QMessageBox.warning(self, "Action Error", "Failed to request OBS action; please try again.")
    def on_scene_item_double_clicked(self, item, column):
        # Only handle double-clicks on child items (sources)
        parent = item.parent()
        if not parent:
            return
        data = item.data(0, Qt.ItemDataRole.UserRole)
        if not data or not self.obs_connector:
            return
        # Stored data: (scene_name, item_id, enabled)
        scene_name, item_id, enabled = data
        if not self.obs_connector.connected:
            QMessageBox.warning(self, "Toggle Source", "OBS is not connected.")
            return
        if not self.obs_connector.isRunning():
            websocket_logger.warning("OBS connector thread not running; attempting to start it...")
            try:
                self.obs_connector.start()
            except Exception as e:
                websocket_logger.error(f"Failed to start OBS connector thread: {e}")
                QMessageBox.warning(self, "Toggle Source", "OBS connector thread was not running and failed to start.")
                return
        try:
            # We have the cached enabled state in item data; use that to toggle
            if enabled is None:
                QMessageBox.warning(self, "Toggle Source", "Could not find the source to toggle.")
                return
            # Toggle enabled state
            action = {
                'action': 'set_scene_item_enabled',
                'scene': scene_name,
                'item_id': item_id,
                'enabled': not enabled
            }
            try:
                self.obs_connector.action_requested.emit(action)
                # Optimistic UI update: reflect toggled state immediately (text + widget)
                try:
                    # If the name is rendered inside a widget (column 0), use that label; otherwise fall back to the item text
                    new_enabled = not enabled
                    w = self.scene_tree.itemWidget(item, 0)
                    if w:
                        name_lbl = w.findChild(QLabel)
                        base_name = name_lbl.text() if name_lbl else item.text(0)
                    else:
                        base_name = item.text(0)
                    item.setData(0, Qt.ItemDataRole.UserRole, (scene_name, item_id, new_enabled))
                    # Update widget if present
                    try:
                        w = self.scene_tree.itemWidget(item, 0)
                        if w:
                            btn = w.findChild(QPushButton)
                            if btn:
                                bg = '#4ec745' if new_enabled else '#777777'
                                try:
                                    btn.setFixedSize(12, 12)
                                    btn.setStyleSheet(f"""QPushButton {{ background-color: {bg}; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); padding: 0; }} QPushButton:hover {{ outline: 2px solid rgba(255,255,255,0.06); }}""")
                                    btn.setToolTip('Visible' if new_enabled else 'Hidden')
                                except Exception:
                                    pass
                    except Exception:
                        pass
                except Exception:
                    pass
                self.log_event(f"Requested action: {action}")
            except Exception as e:
                websocket_logger.error(f"Failed to request action via signal: {e}")
                QMessageBox.warning(self, "Action Error", "Failed to request OBS action; please try again.")
            # Refresh scenes to reflect change by signaling the connector thread
            try:
                self.obs_connector.refresh_requested.emit()
            except Exception as e:
                websocket_logger.error(f"Failed to request scenes refresh via signal: {e}")
        except Exception as e:
            websocket_logger.error(f"Failed to toggle source enabled state: {e}")
    def _on_obs_event_for_revert(self, message):
        try:
            if not isinstance(message, str):
                return
            if message.startswith('Failed to execute action:'):
                # Message format: Failed to execute action: {'action': 'set_scene_item_enabled', ...} - <error>
                try:
                    # split and extract payload
                    payload = message.split(':', 1)[1].strip()
                    # The payload contains the action dict and error - we just find the action dict start
                    # We attempt to find "{'action'" and eval the dict safely
                    dict_start = payload.find("{'")
                    if dict_start == -1:
                        dict_start = payload.find('{')
                    if dict_start == -1:
                        return
                    dict_part = payload[dict_start:payload.rfind('}')+1]
                    # Use ast.literal_eval for safety
                    import ast
                    action = ast.literal_eval(dict_part)
                    if action.get('action') == 'set_scene_item_enabled':
                        scene = action.get('scene')
                        item_id = action.get('item_id')
                        # Find the tree item and revert the enabled state
                        for i in range(self.scene_tree.topLevelItemCount()):
                            scene_item = self.scene_tree.topLevelItem(i)
                            if scene_item.text(0) == scene:
                                for j in range(scene_item.childCount()):
                                    child = scene_item.child(j)
                                    data = child.data(0, Qt.ItemDataRole.UserRole)
                                    if data and data[1] == item_id:
                                        # Revert the enabled flag
                                        current_data = data
                                        # set enabled back to not what action requested
                                        child.setData(0, Qt.ItemDataRole.UserRole, (current_data[0], current_data[1], not action.get('enabled')))
                                        # Update text adornment
                                        base_name = child.text(0).replace(' ✅', '').replace(' ❌', '')
                                        child.setText(0, base_name + (' ✅' if not action.get('enabled') else ''))
                                        self.log_event(f"Reverted optimistic toggle for item {item_id} in {scene} due to failure")
                                        return
                except Exception:
                    return
        except Exception:
            pass
    def _forward_context_menu_from_widget(self, widget, pos):
        try:
            global_pos = widget.mapToGlobal(pos)
            tree_pos = self.scene_tree.viewport().mapFromGlobal(global_pos)
            self.scene_tree_context_menu(tree_pos)
        except Exception as e:
            bot_logger.error(f"Error forwarding context menu from widget: {e}")
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
        vbar = self.log_area.verticalScrollBar()
        old_value = vbar.value()
        old_maximum = vbar.maximum()
        was_at_top = old_value <= vbar.minimum() + 1
        cursor = self.log_area.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.Start)
        cursor.insertText(f"{event}\n")
        self.log_area.setTextCursor(cursor)
        if was_at_top:
            vbar.setValue(vbar.minimum())
        else:
            growth = vbar.maximum() - old_maximum
            vbar.setValue(old_value + max(0, growth))
    def toggle_log_visibility(self):
        self.log_expanded = not self.log_expanded
        self.set_log_visibility(self.log_expanded)
        self.config.set('log_expanded', self.log_expanded)
    def set_log_visibility(self, visible):
        self.log_group.setVisible(visible)
        arrow = "▼ Event Log" if visible else "▶ Event Log"
        self.log_toggle_btn.setText(arrow)
    def on_start_stream_clicked(self):
        if not self.obs_connector:
            return
        try:
            is_streaming = self.status_panel.stream_status.text() == "🟢 ON"
            if is_streaming:
                self.obs_connector.stop_stream()
                self.start_stream_btn.setText("▶ Start Stream")
                self.log_event("⏹ Stopping stream...")
            else:
                self.obs_connector.start_stream()
                self.start_stream_btn.setText("⏹ Stop Stream")
                self.log_event("▶ Starting stream...")
        except Exception as e:
            self.log_event(f"Error toggling stream: {e}")
    def on_start_recording_clicked(self):
        if not self.obs_connector:
            return
        try:
            is_recording = self.status_panel.record_status.text() == "🟢 ON"
            if is_recording:
                self.obs_connector.stop_recording()
                self.start_recording_btn.setText("⏺ Start Recording")
                self.log_event("⏹ Stopping recording...")
            else:
                self.obs_connector.start_recording()
                self.start_recording_btn.setText("⏹ Stop Recording")
                self.log_event("⏺ Starting recording...")
        except Exception as e:
            self.log_event(f"Error toggling recording: {e}")
    def on_save_replay_clicked(self):
        if not self.obs_connector:
            return
        try:
            self.obs_connector.save_replay_buffer()
            self.log_event("💾 Replay buffer saved")
        except Exception as e:
            self.log_event(f"Error saving replay: {e}")
    def on_toggle_vcam_clicked(self):
        if not self.obs_connector:
            return
        try:
            # Toggle virtual camera
            self.obs_connector.toggle_virtual_camera()
            self.log_event("📹 Toggling virtual camera...")
        except Exception as e:
            self.log_event(f"Error toggling virtual camera: {e}")
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
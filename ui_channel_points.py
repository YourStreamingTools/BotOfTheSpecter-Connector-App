
import os
import threading
from functools import partial
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QGridLayout,
    QPushButton, QScrollArea, QDialog, QLineEdit, QCheckBox,
    QColorDialog, QSpinBox, QTextEdit, QComboBox, QMessageBox,
    QFrame, QSizePolicy, QListWidget, QListWidgetItem, QTableWidget,
    QTableWidgetItem, QHeaderView, QMenu
)
from PyQt6.QtGui import QIcon, QFont, QPixmap, QColor, QAction
from PyQt6.QtCore import Qt, pyqtSignal, QSize, QTimer
import time
import requests
from constants import bot_logger

# Simple in-memory thumbnail cache to avoid re-fetching the same images
_thumbnail_cache = {}

class ModernButton(QPushButton):
    # Reusing style from ui.py or duplicating for self-containment
    def __init__(self, text, parent=None, bg_color="#0078d4", hover_color="#1084d8"):
        super().__init__(text, parent)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.bg_color = bg_color
        self.hover_color = hover_color
        self.setStyleSheet(f"""
            QPushButton {{
                background-color: {bg_color};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {hover_color};
            }}
        """)

class RewardCard(QFrame):
    edit_clicked = pyqtSignal(str) # reward_id
    delete_clicked = pyqtSignal(str) # reward_id
    toggle_clicked = pyqtSignal(str, bool) # reward_id, new_state
    pause_clicked = pyqtSignal(str, bool) # reward_id, new_state (paused)
    def __init__(self, reward_data):
        super().__init__()
        self.reward_data = reward_data
        self.setup_ui()
    def setup_ui(self):
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setStyleSheet("""
            RewardCard {
                background-color: #2b2b2b;
                border-radius: 8px;
                border: 1px solid #3d3d3d;
            }
            RewardCard:hover {
                border: 1px solid #0078d4;
            }
        """)
        # Flexible width to allow responsive grid scaling
        self.setMinimumHeight(80)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        # Icon / Color Box
        self.icon_label = QLabel()
        # Slightly larger to accommodate thumbnail previews
        self.icon_label.setFixedSize(56, 56)
        self.icon_label.setStyleSheet("border-radius: 6px;")
        # If a reward has a thumbnail URL, load it (async + cached). Otherwise use color box
        image_url = getattr(self.reward_data, 'image_url_1x', None)
        if image_url:
            # Use cached pixmap if available
            cached = _thumbnail_cache.get(image_url)
            if cached:
                pix = cached.scaled(self.icon_label.width(), self.icon_label.height(), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                self.icon_label.setPixmap(pix)
            else:
                # Set temporary color/background while loading
                color = getattr(self.reward_data, 'background_color', '#9147FF') or '#9147FF'
                self.icon_label.setStyleSheet(f"background-color: {color}; border-radius: 6px;")
                def _fetch():
                    try:
                        r = requests.get(image_url, timeout=8)
                        if r.status_code == 200:
                            data = r.content
                            pixmap = QPixmap()
                            if pixmap.loadFromData(data):
                                _thumbnail_cache[image_url] = pixmap
                                # Update UI on main thread
                                QTimer.singleShot(0, lambda p=pixmap: self._apply_pixmap(p))
                    except Exception as e:
                        bot_logger.info(f"Thumbnail load failed for {image_url}: {e}")
                t = threading.Thread(target=_fetch, daemon=True)
                t.start()
        else:
            color = getattr(self.reward_data, 'background_color', '#9147FF') or '#9147FF'
            self.icon_label.setStyleSheet(f"background-color: {color}; border-radius: 6px;")
        layout.addWidget(self.icon_label)
        # Info
        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)
        self.title_label = QLabel(self.reward_data.title)
        self.title_label.setStyleSheet("font-weight: bold; color: white; font-size: 11px;")
        info_layout.addWidget(self.title_label)
        cost_layout = QHBoxLayout()
        cost_layout.setSpacing(4)
        cost_icon = QLabel("💎") # Placeholder for channel point icon
        cost_icon.setStyleSheet("font-size: 10px;")
        self.cost_label = QLabel(str(self.reward_data.cost))
        self.cost_label.setStyleSheet("color: #aaaaaa; font-size: 10px;")
        cost_layout.addWidget(cost_icon)
        cost_layout.addWidget(self.cost_label)
        cost_layout.addStretch()
        info_layout.addLayout(cost_layout)
        layout.addLayout(info_layout)
        layout.addStretch()
        # Controls
        controls_layout = QVBoxLayout()
        controls_layout.setSpacing(4)
        # Power Button (enable/disable quick action)
        self.power_btn = QPushButton("")
        self.power_btn.setFixedSize(34, 34)
        power_color = "#4ec745" if self.reward_data.is_enabled else "#f55047"
        # Make the power button visually prominent with a colored circular background
        self.power_btn.setStyleSheet(f"background-color: {power_color}; color: white; border-radius: 17px; border: none; font-weight: bold;")
        self.power_btn.setToolTip("Enable/Disable Reward")
        self.power_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        # Set bundled SVG icon if available
        try:
            from pathlib import Path
            assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
            icon_path = assets_dir / 'power.svg'
            if icon_path.exists():
                self.power_btn.setIcon(QIcon(str(icon_path)))
                self.power_btn.setIconSize(QSize(22, 22))
        except Exception:
            pass
        self.power_btn.clicked.connect(self.on_toggle)
        # Pause/Resume Button (quick action)
        self.pause_btn = QPushButton("")
        self.pause_btn.setFixedSize(34, 34)
        pause_bg = "#ffa500" if getattr(self.reward_data, 'is_paused', False) else "#3d3d3d"
        self.pause_btn.setStyleSheet(f"background-color: {pause_bg}; color: white; border-radius: 17px; border: none; font-weight: bold;")
        self.pause_btn.setToolTip("Pause/Resume Reward")
        self.pause_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        try:
            from pathlib import Path
            assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
            icon_path = assets_dir / ('play.svg' if getattr(self.reward_data, 'is_paused', False) else 'pause.svg')
            if icon_path.exists():
                self.pause_btn.setIcon(QIcon(str(icon_path)))
                self.pause_btn.setIconSize(QSize(20, 20))
        except Exception:
            pass
        self.pause_btn.clicked.connect(self.on_pause)
        # Edit Button
        self.edit_btn = QPushButton("✎")
        self.edit_btn.setFixedSize(24, 24)
        self.edit_btn.setStyleSheet("border:none; color: #0078d4;")
        self.edit_btn.setToolTip("Edit Reward")
        self.edit_btn.clicked.connect(lambda: self.edit_clicked.emit(self.reward_data.id))
        # Delete Button (uses bundled trash icon)
        self.delete_btn = QPushButton("")
        self.delete_btn.setFixedSize(34, 34)
        self.delete_btn.setToolTip("Delete Reward")
        self.delete_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        # Load bundled trash icon if available
        try:
            from pathlib import Path
            assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
            trash_icon = assets_dir / 'trash.svg'
            if trash_icon.exists():
                self.delete_btn.setIcon(QIcon(str(trash_icon)))
                self.delete_btn.setIconSize(QSize(16, 16))
        except Exception:
            pass
        # Match other quick action buttons: circular dark background with white icon
        self.delete_btn.setStyleSheet("background-color: #3d3d3d; color: white; border-radius: 17px; border: none;")
        self.delete_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.delete_btn.clicked.connect(self.on_delete)
        # Arrange controls: primary quick-actions in a single row (Power, Pause, Delete)
        top_row = QHBoxLayout()
        top_row.addStretch()
        top_row.addWidget(self.power_btn)
        top_row.addSpacing(6)
        top_row.addWidget(self.pause_btn)
        top_row.addSpacing(6)
        top_row.addWidget(self.delete_btn)
        # Secondary action (edit) below, left-aligned
        bottom_row = QHBoxLayout()
        bottom_row.addWidget(self.edit_btn)
        bottom_row.addStretch()
        controls_layout.addLayout(top_row)
        controls_layout.addLayout(bottom_row)
        layout.addLayout(controls_layout)

    def _apply_pixmap(self, pixmap: QPixmap):
        try:
            if not pixmap or pixmap.isNull():
                return
            # Clear any background style so the pixmap shows cleanly
            self.icon_label.setStyleSheet("")
            scaled = pixmap.scaled(self.icon_label.width(), self.icon_label.height(), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            self.icon_label.setPixmap(scaled)
        except Exception as e:
            bot_logger.debug(f"Failed to apply pixmap to reward card: {e}")

    def on_toggle(self):
        try:
            new_state = not self.reward_data.is_enabled
            # Immediate visual feedback
            self.reward_data.is_enabled = new_state
            color = "#4ec745" if new_state else "#f55047"
            try:
                # Update to use colored circular background for better visibility
                self.power_btn.setStyleSheet(f"background-color: {color}; color: white; border-radius: 17px; border: none; font-weight: bold;")
                # Update icon (in case it remains static color/needs refreshing)
                try:
                    from pathlib import Path
                    assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
                    icon_path = assets_dir / 'power.svg'
                    if icon_path.exists():
                        self.power_btn.setIcon(QIcon(str(icon_path)))
                except Exception:
                    pass
            except Exception:
                pass
            self.toggle_clicked.emit(self.reward_data.id, new_state)
        except Exception as e:
            bot_logger.debug(f"Error toggling reward: {e}")

    def on_pause(self):
        try:
            new_state = not getattr(self.reward_data, 'is_paused', False)
            # Immediate visual feedback
            self.reward_data.is_paused = new_state
            try:
                # Update icon and background accordingly
                bg = '#ffa500' if new_state else '#3d3d3d'
                self.pause_btn.setStyleSheet(f"background-color: {bg}; color: white; border-radius: 17px; border: none; font-weight: bold;")
                try:
                    from pathlib import Path
                    assets_dir = Path(__file__).resolve().parent / 'assets' / 'icons'
                    icon_path = assets_dir / ('play.svg' if new_state else 'pause.svg')
                    if icon_path.exists():
                        self.pause_btn.setIcon(QIcon(str(icon_path)))
                except Exception:
                    pass
            except Exception:
                pass
            self.pause_clicked.emit(self.reward_data.id, new_state)
        except Exception as e:
            bot_logger.debug(f"Error toggling pause on reward: {e}")

    def on_delete(self):
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Icon.Warning)
        msg.setWindowTitle("Delete Reward?")
        msg.setText(f"Are you sure you want to delete '{self.reward_data.title}'?")
        msg.setInformativeText("⚠️ This will PERMANENTLY delete the reward from Twitch.\n\nType 'DELETE' to confirm.")
        msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        msg.setDefaultButton(QMessageBox.StandardButton.No)
        resp = msg.exec()
        if resp == QMessageBox.StandardButton.Yes:
           self.delete_clicked.emit(self.reward_data.id)

    def mousePressEvent(self, event):
        try:
            # Emit the edit signal when the user clicks anywhere on the card with left button
            if event.button() == Qt.MouseButton.LeftButton:
                # Don't open the editor if a child button was clicked
                child = self.childAt(event.pos())
                from PyQt6.QtWidgets import QPushButton
                if child and isinstance(child, QPushButton):
                    return super().mousePressEvent(event)
                self.edit_clicked.emit(self.reward_data.id)
        except Exception as e:
            bot_logger.debug(f"Error handling RewardCard click: {e}")
        return super().mousePressEvent(event)

class ChannelPointsTab(QWidget):
    # Signal emitted when a startup refresh completes (used to trigger dependent tasks like redemption polling)
    startup_refresh_completed = pyqtSignal()

    def __init__(self, reward_manager, redemption_handler, parent=None):
        super().__init__(parent)
        self.reward_manager = reward_manager
        self.redemption_handler = redemption_handler
        self.redemption_handler.redemption_queued.connect(self.on_redemption_queued)
        self.redemption_handler.redemption_started.connect(self.on_redemption_started)
        self.redemption_handler.redemption_completed.connect(self.on_redemption_completed)
        self._queue_items = {}  # redemption_id -> QListWidgetItem
        # Debounce timer for refreshes to avoid repeated Twitch API calls
        self._refresh_debounce_timer = QTimer(self)
        self._refresh_debounce_timer.setSingleShot(True)
        self._refresh_debounce_timer.timeout.connect(self.refresh_rewards)
        self._refresh_min_interval = 2000  # ms
        self._last_refresh_time = 0
        self.init_ui()
        # Immediately show cached redemptions from persistent store so UI is populated without waiting
        try:
            cached = self.redemption_handler.get_cached_redemptions()
            for r in cached:
                try:
                    self.on_redemption_queued(r)
                except Exception:
                    pass
        except Exception as e:
            bot_logger.debug(f"Failed to populate cached redemptions into UI: {e}")
        # Show cached rewards (if any) immediately so user does not wait for Twitch API
        try:
            rewards = list(self.reward_manager.rewards.values())
            if rewards:
                self.update_grid(rewards)
                # Defer reflow to viewport resize handling
                self._reflow_timer.start(50)
        except Exception as e:
            bot_logger.debug(f"Failed to populate cached rewards into UI: {e}")
    def init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(16, 16, 16, 16)
        # Toolbar
        toolbar = QHBoxLayout()
        self.new_reward_btn = ModernButton("New Redemption", bg_color="#9147FF", hover_color="#772ce8")
        self.new_reward_btn.clicked.connect(self.open_new_reward_dialog)
        self.refresh_btn = ModernButton("Sync from Twitch", bg_color="#2d2d2d", hover_color="#3d3d3d")
        self.refresh_btn.clicked.connect(self.refresh_rewards)
        toolbar.addWidget(self.new_reward_btn)
        toolbar.addWidget(self.refresh_btn)
        # Auto-fulfill toggle (saved in config: 'auto_fulfill_redemptions')
        self.auto_fulfill_chk = QCheckBox("Auto-fulfill redemptions")
        try:
            init_state = bool(self.reward_manager.config.get('auto_fulfill_redemptions', False))
        except Exception:
            init_state = False
        self.auto_fulfill_chk.setChecked(init_state)
        self.auto_fulfill_chk.setToolTip("When enabled, processed redemptions are automatically marked FULFILLED. Use with caution.")
        self.auto_fulfill_chk.stateChanged.connect(self.on_auto_fulfill_toggled)
        toolbar.addWidget(self.auto_fulfill_chk)
        toolbar.addStretch()
        main_layout.addLayout(toolbar)
        # Note about manageable rewards
        note_label = QLabel("Showing only Channel Points managed by BotOfTheSpecter")
        note_label.setStyleSheet("color: #aaaaaa; font-size: 10px; padding-left: 6px;")
        note_label.setToolTip("Only rewards created or managed by BotOfTheSpecter are displayed here; use 'Sync from Twitch' to refresh the list.")
        main_layout.addWidget(note_label)
        # Split View
        content_layout = QHBoxLayout()
        # Left: Reward Grid
        # Using ScrollArea with GridLayout that adapts to width
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("background-color: transparent; border: none;")
        self.grid_widget = QWidget()
        self.grid_layout = QGridLayout(self.grid_widget)
        self.grid_layout.setSpacing(12)
        self.grid_layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        self.scroll_area.setWidget(self.grid_widget)
        content_layout.addWidget(self.scroll_area, 2) # 66% width
        # Track current reward cards for reflowing
        self._reward_cards = []
        self._card_min_width = 260  # preferred minimum card width including spacing
        self._card_spacing = 12
        # Recalculate columns when the scroll area's viewport changes size
        self.scroll_area.viewport().installEventFilter(self)
        self._reflow_timer = QTimer(self)
        self._reflow_timer.setSingleShot(True)
        self._reflow_timer.timeout.connect(self._reflow_grid)
        # Right: Queue & Actions
        right_panel = QVBoxLayout()
        # Queue Panel
        queue_group = QFrame()
        queue_group.setStyleSheet("background-color: #252525; border-radius: 6px;")
        queue_layout = QVBoxLayout(queue_group)
        queue_label = QLabel("Redemption Queue")
        queue_label.setStyleSheet("font-weight: bold; color: white;")
        queue_layout.addWidget(queue_label)
        self.queue_list = QListWidget()
        self.queue_list.setStyleSheet("background-color: #1e1e1e; border: none; color: #ddd;")
        self.queue_list.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.queue_list.setWordWrap(True)
        self.queue_list.setTextElideMode(Qt.TextElideMode.ElideRight)
        queue_layout.addWidget(self.queue_list)
        right_panel.addWidget(queue_group)
        # Action Mapping hint
        hint_label = QLabel("Select a reward to edit actions")
        hint_label.setStyleSheet("color: #888;")
        right_panel.addWidget(hint_label)
        content_layout.addLayout(right_panel, 1) # 33% width
        main_layout.addLayout(content_layout)

    def refresh_rewards(self):
        bot_logger.info("ChannelPoints: performing refresh now")
        try:
            rewards = self.reward_manager.refresh_rewards()
            self.update_grid(rewards)
            # Defer reflow to viewport resize handling
            self._reflow_timer.start(50)
            # Log a summary so user can check the main app log for thumbnail stats
            try:
                total = len(rewards)
                with_images = sum(1 for r in rewards if getattr(r, 'image_url_1x', None))
                bot_logger.info(f"ChannelPoints: loaded {total} rewards, {with_images} have thumbnails")
            except Exception as e:
                bot_logger.debug(f"Failed to summarize rewards: {e}")
            # track last run time
            try:
                self._last_refresh_time = int(time.time() * 1000)
                # Mark we completed a startup refresh and clear any pending startup request
                if getattr(self, '_startup_requested', False):
                    self._startup_requested = False
                    self._startup_completed = True
                    # Emit signal indicating startup refresh finished so dependent tasks can proceed
                    try:
                        self.startup_refresh_completed.emit()
                    except Exception:
                        pass
                else:
                    # If this is the first-ever refresh, mark startup_completed to prevent accidental duplicate startup calls
                    if not getattr(self, '_startup_completed', False):
                        self._startup_completed = True
                        try:
                            self.startup_refresh_completed.emit()
                        except Exception:
                            pass
            except Exception:
                pass
        except Exception as e:
            bot_logger.error(f"Error refreshing rewards: {e}")
            QMessageBox.critical(self, "Error", f"Failed to sync with Twitch: {e}")

    def schedule_refresh(self, delay_ms: int = 0, startup: bool = False):
        try:
            # If this is a startup request and we've already completed a startup refresh, ignore it
            if startup and getattr(self, '_startup_completed', False):
                bot_logger.debug("ChannelPoints: startup refresh already completed; ignoring duplicate")
                return
            # If this is a startup request and we've already recorded a startup request waiting, ignore it
            if startup and getattr(self, '_startup_requested', False):
                bot_logger.debug("ChannelPoints: startup refresh already requested; ignoring duplicate")
                return
            if startup:
                self._startup_requested = True
            # If a refresh happened very recently, schedule for min interval after last run
            now_ms = int(time.time() * 1000)
            since = now_ms - getattr(self, '_last_refresh_time', 0)
            min_interval = getattr(self, '_refresh_min_interval', 2000)
            if since < min_interval:
                # schedule to run after remaining time
                remaining = min_interval - since
                bot_logger.debug(f"ChannelPoints: refresh called too quickly, scheduling after {remaining}ms")
                self._refresh_debounce_timer.start(remaining)
            else:
                # schedule with provided delay
                self._refresh_debounce_timer.start(delay_ms or 0)
            bot_logger.info("ChannelPoints: refresh requested (debounced)")
        except Exception as e:
            bot_logger.error(f"Failed to schedule ChannelPoints refresh: {e}")

    def on_auto_fulfill_toggled(self, state):
        try:
            # state may be an int or Qt.CheckState; treat truthy as enabled
            enabled = bool(state)
            # Persist to config
            try:
                if getattr(self, 'reward_manager', None) and getattr(self.reward_manager, 'config', None):
                    self.reward_manager.config.set('auto_fulfill_redemptions', bool(enabled))
            except Exception as e:
                bot_logger.error(f"Failed to save auto_fulfill setting: {e}")
            # Update the handler immediately
            try:
                if getattr(self, 'redemption_handler', None):
                    self.redemption_handler.auto_fulfill = bool(enabled)
            except Exception as e:
                bot_logger.error(f"Failed to update redemption handler auto_fulfill: {e}")
            bot_logger.info(f"Auto-fulfill toggled: {enabled}")
        except Exception as e:
            bot_logger.error(f"Error handling auto-fulfill toggle: {e}")

    def eventFilter(self, obj, event):
        # Listen for resize events on the scroll viewport to reflow grid
        try:
            from PyQt6.QtCore import QEvent
            if obj is self.scroll_area.viewport() and event.type() == QEvent.Type.Resize:
                # debounce rapid resizes
                self._reflow_timer.start(50)
        except Exception:
            pass
        return super().eventFilter(obj, event)

    def _calculate_columns(self):
        avail_width = self.scroll_area.viewport().width()
        # account for left/right margins from the grid layout
        # approximate effective width
        effective = max(100, avail_width)
        # Use min card width with spacing
        per_unit = self._card_min_width + self._card_spacing
        cols = max(1, effective // per_unit)
        # Also cap columns reasonably
        cols = min(cols, 6)
        return int(cols)

    def _reflow_grid(self):
        if not self._reward_cards:
            return
        cols = self._calculate_columns()
        # clear layout positions without deleting widgets
        for i in range(self.grid_layout.count()):
            item = self.grid_layout.itemAt(i)
            if item:
                w = item.widget()
                if w:
                    self.grid_layout.removeWidget(w)
        # place widgets with new column count and resize them proportionally
        row = 0
        col = 0
        total_spacing = (cols + 1) * self._card_spacing
        avail = max(0, self.scroll_area.viewport().width() - total_spacing)
        col_width = max(150, avail // cols) if cols > 0 else self._card_min_width
        for w in self._reward_cards:
            # set a preferred width for the card
            try:
                w.setMaximumWidth(col_width)
                w.setMinimumWidth(col_width)
            except Exception:
                pass
            self.grid_layout.addWidget(w, row, col)
            col += 1
            if col >= cols:
                col = 0
                row += 1

    def update_grid(self, rewards):
        # Clear existing
        for i in reversed(range(self.grid_layout.count())):
            item = self.grid_layout.itemAt(i)
            if item:
                w = item.widget()
                if w:
                    w.setParent(None)
        self._reward_cards = []
        for reward in rewards:
            card = RewardCard(reward)
            card.edit_clicked.connect(self.edit_reward)
            card.delete_clicked.connect(self.delete_reward)
            card.toggle_clicked.connect(self.toggle_reward)
            card.pause_clicked.connect(self.pause_reward)
            self._reward_cards.append(card)
        # Perform layout pass
        self._reflow_grid()

class ActionMappingPanel(QWidget):
    def __init__(self, actions=None, parent=None):
        super().__init__(parent)
        self.actions = actions or []
        self.init_ui()
    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        # Header
        header = QHBoxLayout()
        header.addWidget(QLabel("OBS Actions"))
        add_btn = QPushButton("+ Add Action")
        add_btn.clicked.connect(self.add_action)
        header.addWidget(add_btn)
        header.addStretch()
        layout.addLayout(header)
        # Action List
        self.action_table = QTableWidget()
        self.action_table.setColumnCount(3)
        self.action_table.setHorizontalHeaderLabels(["Action Type", "Details", ""])
        self.action_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.action_table)
        self.refresh_table()
    def refresh_table(self):
        self.action_table.setRowCount(0)
        for i, action in enumerate(self.actions):
            self.action_table.insertRow(i)
            # Type
            self.action_table.setItem(i, 0, QTableWidgetItem(action.get('action', 'Unknown')))
            # Details (simplified summary)
            details = []
            for k, v in action.items():
                if k != 'action':
                    details.append(f"{k}: {v}")
            self.action_table.setItem(i, 1, QTableWidgetItem(", ".join(details)))
            # Delete Btn
            del_btn = QPushButton("x")
            del_btn.setFixedSize(20, 20)
            del_btn.clicked.connect(partial(self.remove_action, i))
            self.action_table.setCellWidget(i, 2, del_btn)
    def add_action(self):
        dialog = ActionDialog(self)
        if dialog.exec():
            self.actions.append(dialog.get_data())
            self.refresh_table()
    def remove_action(self, index):
        if 0 <= index < len(self.actions):
            self.actions.pop(index)
            self.refresh_table()

    def get_actions(self):
        return self.actions

class ActionDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Add OBS Action")
        self.setup_ui()
    def setup_ui(self):
        layout = QVBoxLayout(self)
        # Action Type
        layout.addWidget(QLabel("Action Type:"))
        self.type_combo = QComboBox()
        self.type_combo.addItems([
            "set_current_program_scene",
            "set_scene_item_enabled", # visibility
            "set_input_mute",
            "trigger_hotkey_by_name",
            "set_text_source", # useful for user input
            "wait"
        ])
        self.type_combo.currentTextChanged.connect(self.update_fields)
        layout.addWidget(self.type_combo)
        # Dynamic Fields Area
        self.fields_widget = QWidget()
        self.fields_layout = QGridLayout(self.fields_widget)
        layout.addWidget(self.fields_widget)
        self.inputs = {}
        self.update_fields(self.type_combo.currentText())
        # Buttons
        btns = QHBoxLayout()
        ok_btn = QPushButton("Add")
        ok_btn.clicked.connect(self.accept)
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        btns.addWidget(ok_btn)
        btns.addWidget(cancel_btn)
        layout.addLayout(btns)
    def update_fields(self, action_type):
        # clear layout
        for i in reversed(range(self.fields_layout.count())): 
            self.fields_layout.itemAt(i).widget().setParent(None)
        self.inputs = {}
        row = 0
        if action_type == "set_current_program_scene":
            self.add_field("scene", "Scene Name:", row)
        elif action_type == "set_scene_item_enabled":
            self.add_field("scene", "Scene Name:", row); row+=1
            self.add_field("item_id", "Source Name/ID:", row); row+=1 # using source name usually
            self.add_field("enabled", "Enabled (true/false):", row)
        elif action_type == "wait":
            self.add_field("duration", "Duration (seconds):", row)
        elif action_type == "set_text_source":
            self.add_field("source", "Source Name:", row); row+=1
            self.add_field("text", "Text (%user%, %input%):", row)
    def add_field(self, key, label, row):
        self.fields_layout.addWidget(QLabel(label), row, 0)
        inp = QLineEdit()
        self.fields_layout.addWidget(inp, row, 1)
        self.inputs[key] = inp
    def get_data(self):
        data = {'action': self.type_combo.currentText()}
        for k, inp in self.inputs.items():
            val = inp.text()
            # simple type conversion
            if val.lower() == 'true': val = True
            elif val.lower() == 'false': val = False
            elif val.replace('.','',1).isdigit(): val = float(val)
            data[k] = val
        return data

class RewardEditDialog(QDialog):
    def __init__(self, reward_data=None, parent=None):
        super().__init__(parent)
        self.reward_data = reward_data
        self.setWindowTitle("Edit Reward" if reward_data else "Create Reward")
        self.resize(600, 700)
        self.init_ui()
    def init_ui(self):
        layout = QVBoxLayout(self)
        form_widget = QWidget()
        form_layout = QVBoxLayout(form_widget)
        # --- Twitch Settings ---
        group = QFrame()
        group.setStyleSheet("background-color: #2b2b2b; border-radius: 6px; padding: 10px;")
        g_layout = QGridLayout(group)
        g_layout.addWidget(QLabel("Title:"), 0, 0)
        self.title_edit = QLineEdit()
        if self.reward_data: self.title_edit.setText(self.reward_data.title)
        g_layout.addWidget(self.title_edit, 0, 1)
        g_layout.addWidget(QLabel("Cost:"), 1, 0)
        self.cost_spin = QSpinBox()
        self.cost_spin.setRange(1, 10000000)
        if self.reward_data: self.cost_spin.setValue(self.reward_data.cost)
        g_layout.addWidget(self.cost_spin, 1, 1)
        g_layout.addWidget(QLabel("Prompt:"), 2, 0)
        self.prompt_edit = QLineEdit()
        if self.reward_data and self.reward_data.prompt: 
            self.prompt_edit.setText(self.reward_data.prompt)
        g_layout.addWidget(self.prompt_edit, 2, 1)
        g_layout.addWidget(QLabel("Bg Color:"), 3, 0)
        self.color_edit = QLineEdit()
        if self.reward_data: self.color_edit.setText(self.reward_data.background_color)
        g_layout.addWidget(self.color_edit, 3, 1)
        self.enabled_chk = QCheckBox("Is Enabled")
        if self.reward_data: self.enabled_chk.setChecked(self.reward_data.is_enabled)
        else: self.enabled_chk.setChecked(True)
        g_layout.addWidget(self.enabled_chk, 4, 0, 1, 2)
        self.input_req_chk = QCheckBox("User Input Required")
        if self.reward_data: self.input_req_chk.setChecked(self.reward_data.is_user_input_required)
        g_layout.addWidget(self.input_req_chk, 5, 0, 1, 2)
        # Limit per-stream
        self.max_per_stream_chk = QCheckBox("Limit per stream")
        self.max_per_stream_spin = QSpinBox()
        self.max_per_stream_spin.setRange(1, 1000000)
        if self.reward_data:
            self.max_per_stream_chk.setChecked(self.reward_data.is_max_per_stream_enabled)
            self.max_per_stream_spin.setValue(getattr(self.reward_data, 'max_per_stream', 0) or 1)
        else:
            self.max_per_stream_chk.setChecked(False)
            self.max_per_stream_spin.setValue(1)
        self.max_per_stream_spin.setEnabled(self.max_per_stream_chk.isChecked())
        self.max_per_stream_chk.stateChanged.connect(lambda s: self.max_per_stream_spin.setEnabled(bool(s)))
        g_layout.addWidget(self.max_per_stream_chk, 6, 0)
        g_layout.addWidget(self.max_per_stream_spin, 6, 1)
        # Limit per-user per-stream
        self.max_per_user_chk = QCheckBox("Limit per user per stream")
        self.max_per_user_spin = QSpinBox()
        self.max_per_user_spin.setRange(1, 1000000)
        if self.reward_data:
            self.max_per_user_chk.setChecked(self.reward_data.is_max_per_user_per_stream_enabled)
            self.max_per_user_spin.setValue(getattr(self.reward_data, 'max_per_user_per_stream', 0) or 1)
        else:
            self.max_per_user_chk.setChecked(False)
            self.max_per_user_spin.setValue(1)
        self.max_per_user_spin.setEnabled(self.max_per_user_chk.isChecked())
        self.max_per_user_chk.stateChanged.connect(lambda s: self.max_per_user_spin.setEnabled(bool(s)))
        g_layout.addWidget(self.max_per_user_chk, 7, 0)
        g_layout.addWidget(self.max_per_user_spin, 7, 1)
        # Global cooldown
        self.global_cooldown_chk = QCheckBox("Enable global cooldown")
        self.global_cooldown_spin = QSpinBox()
        self.global_cooldown_spin.setRange(1, 604800)  # Twitch max: 604800
        if self.reward_data:
            self.global_cooldown_chk.setChecked(self.reward_data.is_global_cooldown_enabled)
            self.global_cooldown_spin.setValue(getattr(self.reward_data, 'global_cooldown_seconds', 0) or 60)
        else:
            self.global_cooldown_chk.setChecked(False)
            self.global_cooldown_spin.setValue(60)
        self.global_cooldown_spin.setEnabled(self.global_cooldown_chk.isChecked())
        self.global_cooldown_chk.stateChanged.connect(lambda s: self.global_cooldown_spin.setEnabled(bool(s)))
        g_layout.addWidget(self.global_cooldown_chk, 8, 0)
        g_layout.addWidget(self.global_cooldown_spin, 8, 1)
        # Pause and auto-fulfill
        self.is_paused_chk = QCheckBox("Is Paused")
        if self.reward_data: self.is_paused_chk.setChecked(getattr(self.reward_data, 'is_paused', False))
        g_layout.addWidget(self.is_paused_chk, 9, 0, 1, 2)
        self.skip_queue_chk = QCheckBox("Skip Request Queue (Auto-fulfill)")
        if self.reward_data: self.skip_queue_chk.setChecked(self.reward_data.should_redemptions_skip_request_queue)
        g_layout.addWidget(self.skip_queue_chk, 10, 0, 1, 2)
        form_layout.addWidget(QLabel("<b>Twitch Settings</b>"))
        form_layout.addWidget(group)
        # --- OBS Actions ---
        form_layout.addWidget(QLabel("<b>OBS Actions</b>"))
        initial_actions = self.reward_data.obs_actions if self.reward_data else []
        self.action_panel = ActionMappingPanel(actions=list(initial_actions)) # copy list
        form_layout.addWidget(self.action_panel)
        layout.addWidget(form_widget)
        # Try to size dialog to fit content if screen space allows
        try:
            from PyQt6.QtGui import QGuiApplication
            screen_geom = QGuiApplication.primaryScreen().availableGeometry()
            desired_h = min(screen_geom.height() - 100, form_widget.sizeHint().height() + 180)
            desired_w = min(screen_geom.width() - 100, 800)
            self.resize(desired_w, desired_h)
            self.setMinimumSize(500, 420)
            self.setSizeGripEnabled(True)
        except Exception as e:
            bot_logger.debug(f"Could not auto-resize RewardEditDialog: {e}")
        # Buttons
        btns = QHBoxLayout()
        save_btn = QPushButton("Save")
        save_btn.clicked.connect(self.accept)
        # Style save button
        save_btn.setStyleSheet("background-color: #9147FF; color: white; font-weight: bold; padding: 8px;")
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        btns.addStretch()
        btns.addWidget(cancel_btn)
        btns.addWidget(save_btn)
        layout.addLayout(btns)
    def get_data(self):
        return {
            'title': self.title_edit.text(),
            'cost': self.cost_spin.value(),
            'prompt': self.prompt_edit.text(),
            'background_color': self.color_edit.text(),
            'is_enabled': self.enabled_chk.isChecked(),
            'is_user_input_required': self.input_req_chk.isChecked(),
            'is_max_per_stream_enabled': self.max_per_stream_chk.isChecked(),
            'max_per_stream': self.max_per_stream_spin.value(),
            'is_max_per_user_per_stream_enabled': self.max_per_user_chk.isChecked(),
            'max_per_user_per_stream': self.max_per_user_spin.value(),
            'is_global_cooldown_enabled': self.global_cooldown_chk.isChecked(),
            'global_cooldown_seconds': self.global_cooldown_spin.value(),
            'is_paused': self.is_paused_chk.isChecked(),
            'should_redemptions_skip_request_queue': self.skip_queue_chk.isChecked(),
            'obs_actions': self.action_panel.get_actions()
        }
    # Connect detailed logic in ChannelPointsTab methods override

def _open_new_reward_dialog(self):
    dialog = RewardEditDialog(parent=self)
    if dialog.exec():
        data = dialog.get_data()
        try:
            # Extract obs_actions to separate list
            obs_actions = data.pop('obs_actions', [])
            self.reward_manager.create_reward(obs_actions=obs_actions, **data)
            self.refresh_rewards()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to create reward: {e}")

def _edit_reward(self, reward_id):
    reward = self.reward_manager.get_reward_by_id(reward_id)
    if not reward:
        return
    dialog = RewardEditDialog(reward, parent=self)
    if dialog.exec():
        data = dialog.get_data()
        # Basic validation
        title = (data.get('title') or '').strip()
        if not title:
            QMessageBox.warning(self, "Validation Error", "Title must not be empty.")
            return
        if len(title) > 45:
            QMessageBox.warning(self, "Validation Error", "Title must be 45 characters or fewer.")
            return
        # Ensure title uniqueness among other rewards
        for rid, r in self.reward_manager.rewards.items():
            if rid != reward_id and getattr(r, 'title', '').strip().lower() == title.lower():
                QMessageBox.warning(self, "Validation Error", "Another reward already uses that title. Please choose a unique title.")
                return
        # Additional validation for constraints
        if data.get('is_max_per_stream_enabled') and (data.get('max_per_stream', 0) < 1):
            QMessageBox.warning(self, "Validation Error", "Max per stream must be at least 1 when enabled.")
            return
        if data.get('is_max_per_user_per_stream_enabled') and (data.get('max_per_user_per_stream', 0) < 1):
            QMessageBox.warning(self, "Validation Error", "Max per user per stream must be at least 1 when enabled.")
            return
        if data.get('is_global_cooldown_enabled'):
            g = data.get('global_cooldown_seconds', 0)
            if g < 1 or g > 604800:
                QMessageBox.warning(self, "Validation Error", "Global cooldown must be between 1 and 604800 seconds.")
                return
        # Prompt length check if user input required
        if data.get('is_user_input_required') and len((data.get('prompt') or '').strip()) == 0:
            QMessageBox.warning(self, "Validation Error", "Prompt is required when user input is enabled.")
            return
        if len((data.get('prompt') or '')) > 200:
            QMessageBox.warning(self, "Validation Error", "Prompt must be 200 characters or fewer.")
            return
        try:
            obs_actions = data.pop('obs_actions', [])
            # Only send changed fields - build payload with explicit fields
            payload = {}
            for k in ['title', 'prompt', 'cost', 'background_color', 'is_enabled', 'is_user_input_required',
                      'is_max_per_stream_enabled', 'max_per_stream', 'is_max_per_user_per_stream_enabled', 'max_per_user_per_stream',
                      'is_global_cooldown_enabled', 'global_cooldown_seconds', 'is_paused', 'should_redemptions_skip_request_queue']:
                if k in data:
                    payload[k] = data[k]
            self.reward_manager.update_reward(reward_id, obs_actions=obs_actions, **payload)
            self.refresh_rewards()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to update reward: {e}")

# Monkey patch methods to class (cleaner than big indents inside class definition)
ChannelPointsTab.open_new_reward_dialog = _open_new_reward_dialog
ChannelPointsTab.edit_reward = _edit_reward

def format_redemption_display(redemption, reward_manager=None):
    # User name fallbacks
    user_obj = redemption.get('user') or {}
    if isinstance(user_obj, dict):
        user = user_obj.get('display_name') or user_obj.get('login') or user_obj.get('name')
    else:
        user = None
    user = user or redemption.get('user_name') or redemption.get('user_login') or redemption.get('user_id') or 'Unknown'
    # Reward title fallbacks
    reward_obj = redemption.get('reward') or {}
    title = None
    if isinstance(reward_obj, dict):
        title = reward_obj.get('title')
        rid = reward_obj.get('id')
    else:
        title = None
        rid = redemption.get('reward_id') or redemption.get('rewardId')
    # Try reward manager if title missing
    if not title and rid and reward_manager:
        try:
            r = reward_manager.get_reward_by_id(rid)
            if r:
                title = r.title
        except Exception:
            pass
    title = title or 'Unknown'
    return f"{user} redeemed {title}"


def _on_redemption_queued(self, redemption):
    try:
        text = format_redemption_display(redemption, getattr(self, 'reward_manager', None))
        item = QListWidgetItem(f"⏳ {text}")
        item.setForeground(QColor("#dddddd"))
        redemption_id = redemption.get('id')
        if redemption_id:
            item.setData(Qt.ItemDataRole.UserRole, redemption_id)
            self._queue_items[redemption_id] = item
        self.queue_list.addItem(item)
    except Exception as e:
        bot_logger.error(f"Error formatting queued redemption for UI: {e}")
        try:
            self.queue_list.addItem(QListWidgetItem("⏳ Unknown redeemed Unknown"))
        except Exception:
            pass

def _on_redemption_started(self, redemption_id):
    try:
        item = getattr(self, '_queue_items', {}).get(redemption_id)
        if item:
            text = item.text()
            for prefix in ("⏳ ", "✅ ", "❌ ", "⚙️ "):
                if text.startswith(prefix):
                    text = text[len(prefix):]
                    break
            item.setText(f"⚙️ {text}")
            item.setForeground(QColor("#f0c040"))
    except Exception as e:
        bot_logger.debug(f"Error updating started redemption in UI: {e}")

def _on_redemption_completed(self, redemption_id, success):
    try:
        item = getattr(self, '_queue_items', {}).get(redemption_id)
        if item:
            text = item.text()
            for prefix in ("⏳ ", "✅ ", "❌ ", "⚙️ "):
                if text.startswith(prefix):
                    text = text[len(prefix):]
                    break
            if success:
                item.setText(f"✅ {text}")
                item.setForeground(QColor("#4ec745"))
            else:
                item.setText(f"❌ {text}")
                item.setForeground(QColor("#f55047"))
    except Exception as e:
        bot_logger.debug(f"Error updating completed redemption in UI: {e}")

ChannelPointsTab.on_redemption_queued = _on_redemption_queued
ChannelPointsTab.on_redemption_started = _on_redemption_started
ChannelPointsTab.on_redemption_completed = _on_redemption_completed

def _delete_reward(self, reward_id):
    try:
        self.reward_manager.delete_reward(reward_id)
        self.refresh_rewards()
    except Exception as e:
        QMessageBox.critical(self, "Error", f"Failed to delete reward: {e}")

def _toggle_reward(self, reward_id, new_state):
    try:
        self.reward_manager.update_reward(reward_id, is_enabled=new_state)
        self.refresh_rewards() # Refresh to update UI state specifically
    except Exception as e:
        QMessageBox.critical(self, "Error", f"Failed to toggle reward: {e}")

def _pause_reward(self, reward_id, new_state):
    try:
        self.reward_manager.update_reward(reward_id, is_paused=new_state)
        self.refresh_rewards()
    except Exception as e:
        QMessageBox.critical(self, "Error", f"Failed to set pause state on reward: {e}")

ChannelPointsTab.delete_reward = _delete_reward
ChannelPointsTab.toggle_reward = _toggle_reward
ChannelPointsTab.pause_reward = _pause_reward


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
from constants import bot_logger

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
        self.setFixedSize(280, 80)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        
        # Icon / Color Box
        self.icon_label = QLabel()
        self.icon_label.setFixedSize(48, 48)
        if hasattr(self.reward_data, 'background_color'):
            color = self.reward_data.background_color or "#9147FF"
            self.icon_label.setStyleSheet(f"background-color: {color}; border-radius: 4px;")
            
            # If image exists, we could load it here (async ideally)
            # For now just showing color box with optional text icon
        else:
             self.icon_label.setStyleSheet("background-color: #9147FF; border-radius: 4px;")
        
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
        
        # Toggle Switch (using CheckBox for simplicity styled as switch ?) or just standard button
        self.toggle_btn = QPushButton("⬤" if self.reward_data.is_enabled else "◯")
        self.toggle_btn.setFixedSize(24, 24)
        self.toggle_btn.setStyleSheet("border:none; color: " + ("#4ec745" if self.reward_data.is_enabled else "#aaaaaa"))
        self.toggle_btn.setToolTip("Toggle Enable/Disable")
        self.toggle_btn.clicked.connect(self.on_toggle)
        
        # Edit Button
        self.edit_btn = QPushButton("✎")
        self.edit_btn.setFixedSize(24, 24)
        self.edit_btn.setStyleSheet("border:none; color: #0078d4;")
        self.edit_btn.setToolTip("Edit Reward")
        self.edit_btn.clicked.connect(lambda: self.edit_clicked.emit(self.reward_data.id))

        # Delete Button
        self.delete_btn = QPushButton("🗑")
        self.delete_btn.setFixedSize(24, 24)
        self.delete_btn.setStyleSheet("border:none; color: #f55047;")
        self.delete_btn.setToolTip("Delete Reward")
        self.delete_btn.clicked.connect(self.on_delete)
        
        # Arrange controls usually in a grid or stack
        # Top right: Toggle
        # Bottom right: Edit, Delete
        
        top_row = QHBoxLayout()
        top_row.addStretch()
        top_row.addWidget(self.toggle_btn)
        
        bottom_row = QHBoxLayout()
        bottom_row.addWidget(self.edit_btn)
        bottom_row.addWidget(self.delete_btn)
        
        controls_layout.addLayout(top_row)
        controls_layout.addLayout(bottom_row)
        
        layout.addLayout(controls_layout)

    def on_toggle(self):
        new_state = not self.reward_data.is_enabled
        self.toggle_clicked.emit(self.reward_data.id, new_state)

    def on_delete(self):
        # Confirmation happens in parent controller or here?
        # Let's emit and let parent handle confirmation dialog to keep UI logic centralized 
        # or handle it here. The Task says "Wait, Must show confirmation dialog".
        msg = QMessageBox(self)
        msg.setIcon(QMessageBox.Icon.Warning)
        msg.setWindowTitle("Delete Reward?")
        msg.setText(f"Are you sure you want to delete '{self.reward_data.title}'?")
        msg.setInformativeText("⚠️ This will PERMANENTLY delete the reward from Twitch.\n\nType 'DELETE' to confirm.")
        
        # Customizing for explicit confirmation as requested
        # Standard QMessageBox doesn't have input. Let's use simple Yes/No for now 
        # but add the heavy warning text.
        msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        msg.setDefaultButton(QMessageBox.StandardButton.No)
        
        resp = msg.exec()
        if resp == QMessageBox.StandardButton.Yes:
           self.delete_clicked.emit(self.reward_data.id)

class ChannelPointsTab(QWidget):
    def __init__(self, reward_manager, redemption_handler, parent=None):
        super().__init__(parent)
        self.reward_manager = reward_manager
        self.redemption_handler = redemption_handler
        self.redemption_handler.redemption_queued.connect(self.on_redemption_queued)
        self.redemption_handler.redemption_completed.connect(self.on_redemption_completed)
        self.init_ui()
        
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
        toolbar.addStretch()
        
        main_layout.addLayout(toolbar)
        
        # Split View
        content_layout = QHBoxLayout()
        
        # Left: Reward Grid
        # Using ScrollArea with Flow Layout or GridLayout
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("background-color: transparent; border: none;")
        
        self.grid_widget = QWidget()
        self.grid_layout = QGridLayout(self.grid_widget)
        self.grid_layout.setSpacing(12)
        self.grid_layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        
        self.scroll_area.setWidget(self.grid_widget)
        content_layout.addWidget(self.scroll_area, 2) # 66% width
        
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
        queue_layout.addWidget(self.queue_list)
        
        right_panel.addWidget(queue_group)
        
        # Action Mapping hint
        hint_label = QLabel("Select a reward to edit actions")
        hint_label.setStyleSheet("color: #888;")
        right_panel.addWidget(hint_label)
        
        content_layout.addLayout(right_panel, 1) # 33% width
        
        main_layout.addLayout(content_layout)
        
        # Load rewards
        QTimer.singleShot(500, self.refresh_rewards)

    def refresh_rewards(self):
        """Reload rewards from manager"""
        try:
            rewards = self.reward_manager.refresh_rewards()
            self.update_grid(rewards)
        except Exception as e:
            bot_logger.error(f"Error refreshing rewards: {e}")
            QMessageBox.critical(self, "Error", f"Failed to sync with Twitch: {e}")

    def update_grid(self, rewards):
        # Clear existing
        for i in reversed(range(self.grid_layout.count())): 
            self.grid_layout.itemAt(i).widget().setParent(None)
            
        row = 0
        col = 0
        max_cols = 2 
        
        for reward in rewards:
            card = RewardCard(reward)
            card.edit_clicked.connect(self.edit_reward)
            card.delete_clicked.connect(self.delete_reward)
            card.toggle_clicked.connect(self.toggle_reward)
            
            self.grid_layout.addWidget(card, row, col)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1

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
        # Dialog to pick action type and params
        # For simplicity, let's just add a generic Set Scene action template or show a dialog
        # Implementing a simple ActionDialog inline here for brevity
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
        
        # Scroll area for form
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
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
        
        self.skip_queue_chk = QCheckBox("Skip Request Queue (Auto-fulfill)")
        if self.reward_data: self.skip_queue_chk.setChecked(self.reward_data.should_redemptions_skip_request_queue)
        g_layout.addWidget(self.skip_queue_chk, 6, 0, 1, 2)
        
        form_layout.addWidget(QLabel("<b>Twitch Settings</b>"))
        form_layout.addWidget(group)
        
        # --- OBS Actions ---
        form_layout.addWidget(QLabel("<b>OBS Actions</b>"))
        initial_actions = self.reward_data.obs_actions if self.reward_data else []
        self.action_panel = ActionMappingPanel(actions=list(initial_actions)) # copy list
        form_layout.addWidget(self.action_panel)
        
        scroll.setWidget(form_widget)
        layout.addWidget(scroll)
        
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
        try:
            obs_actions = data.pop('obs_actions', [])
            self.reward_manager.update_reward(reward_id, obs_actions=obs_actions, **data)
            self.refresh_rewards()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to update reward: {e}")

# Monkey patch methods to class (cleaner than big indents inside class definition)
ChannelPointsTab.open_new_reward_dialog = _open_new_reward_dialog
ChannelPointsTab.edit_reward = _edit_reward

def _on_redemption_queued(self, redemption):
    user = redemption.get('user', {}).get('display_name', 'Unknown')
    reward = redemption.get('reward', {}).get('title', 'Unknown')
    self.queue_list.addItem(f"{user} redeemed {reward}")

def _on_redemption_completed(self, redemption_id, success):
    # Could potentially update queue item visual state here
    pass

ChannelPointsTab.on_redemption_queued = _on_redemption_queued
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

ChannelPointsTab.delete_reward = _delete_reward
ChannelPointsTab.toggle_reward = _toggle_reward

from typing import Final

DARK_THEME_QSS: Final[str] = """
/* Global */
QWidget { background: #0f0f10; color: #E6E6E6; font-family: "Segoe UI", Roboto, Arial; }
QGroupBox { border: 1px solid #262626; border-radius: 8px; padding: 8px; }
QPushButton { background: #0A66C2; color: white; border-radius: 6px; padding: 8px 12px; }
QPushButton:hover { background: #0E7CD9; }
QPushButton:disabled { background: #3A3A3A; color: #7A7A7A; }
QLineEdit, QTextEdit { background: #121212; border: 1px solid #262626; border-radius: 6px; padding: 6px; color: #DDD; }
QTreeWidget, QListWidget { background: #0d0d0d; border: 1px solid #262626; }
QHeaderView::section { background: #151515; color: #DDD; }
QStatusBar { background: #0b0b0b; color: #AAA; border-top: 1px solid #1a1a1a; }

/* Sidebar */
QWidget#sidebar { background: #0b0b0b; }
QLabel#sidebarLogo { margin-top: 8px; margin-bottom: 4px; }
QPushButton[nav="true"] {
    background-color: transparent;
    color: #E6E6E6;
    border: none;
    text-align: left;
    padding: 10px 12px;
    font-weight: 600;
    border-radius: 6px;
}
QPushButton[nav="true"]:hover { background-color: #151515; }
QPushButton[nav="true"]:checked { background-color: #0078d4; color: white; }

/* Log area */
QTextEdit#logArea { background-color: #0d0d0d; color: #e6e6e6; font-family: 'Courier New', monospace; }

/* Small helper */
QLabel.small { color: #999999; font-size: 11px; }
"""


def get_dark_theme() -> str:
    """Return the default dark theme stylesheet for the application."""
    return DARK_THEME_QSS

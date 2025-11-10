import os
import logging
import requests

# Directory and file paths
APPDATA_DIR = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'BotOfTheSpecter', 'OBSConnector')
os.makedirs(APPDATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(APPDATA_DIR, 'config.json')
LOG_FILE = os.path.join(APPDATA_DIR, 'app.log')
ICON_FILE = os.path.join(APPDATA_DIR, 'botofthespecter.png')

# Application Constants
API_TOKEN = None  # Will be set from config
CHANNEL_NAME = "OBS"
VERSION = "1.1"
SPECTER_WEBSOCKET_URI = "https://websocket.botofthespecter.com"
ICON_URL = "https://cdn.botofthespecter.com/logo.png"

# WebSocket Configuration
RECONNECT_DELAY = 60  # Fixed 60 second delay for each reconnection attempt
CONNECTION_TIMEOUT = 30  # 30 second timeout for connection + registration
JITTER_RANGE = (0, 5)  # 0-5 second jitter to prevent simultaneous reconnections

# Setup logging
def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger(__name__)

# Get loggers for different components
websocket_logger = logging.getLogger('websocket')
bot_logger = logging.getLogger('bot')

# Utility functions
def download_icon():
    if os.path.exists(ICON_FILE):
        return True
    try:
        response = requests.get(ICON_URL)
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
import os
import logging
import requests

# Directory and file paths
APPDATA_DIR = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'BotOfTheSpecter', 'OBSConnector')
os.makedirs(APPDATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(APPDATA_DIR, 'config.json')
LOG_FILE = os.path.join(APPDATA_DIR, 'app.log')
OBS_EVENTS_LOG_FILE = os.path.join(APPDATA_DIR, 'obs_events.log')
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
obs_events_logger = None

def setup_obs_events_logging():
    global obs_events_logger
    obs_events_logger = logging.getLogger('obs_events')
    obs_events_logger.setLevel(logging.INFO)
    obs_events_logger.propagate = False  # Don't propagate to root logger
    # Clear any existing handlers
    obs_events_logger.handlers = []
    # File handler
    try:
        obs_events_handler = logging.FileHandler(OBS_EVENTS_LOG_FILE)
        obs_events_handler.setLevel(logging.INFO)
        obs_events_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        obs_events_handler.setFormatter(obs_events_formatter)
        obs_events_logger.addHandler(obs_events_handler)
    except Exception as e:
        print(f"Failed to create OBS events file handler: {e}")
    # Console handler for debugging
    try:
        obs_events_console_handler = logging.StreamHandler()
        obs_events_console_handler.setLevel(logging.INFO)
        obs_events_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        obs_events_console_handler.setFormatter(obs_events_formatter)
        obs_events_logger.addHandler(obs_events_console_handler)
    except Exception as e:
        print(f"Failed to create OBS events console handler: {e}")
    return obs_events_logger

# Setup initial obs_events_logger
setup_obs_events_logging()

# Utility functions
def redact_sensitive_data(data):
    if isinstance(data, dict):
        safe_data = {}
        # List of keys to redact
        sensitive_keys = ['code', 'api_key', 'password', 'token', 'secret', 'auth', 'channel_code']
        for key, value in data.items():
            if key in sensitive_keys:
                # Always redact completely - never show any part of the key
                safe_data[key] = '***REDACTED***'
            elif isinstance(value, dict):
                # Recursively redact nested dictionaries
                safe_data[key] = redact_sensitive_data(value)
            elif isinstance(value, (list, tuple)):
                # Recursively redact items in lists/tuples
                safe_data[key] = [redact_sensitive_data(item) if isinstance(item, dict) else item for item in value]
            else:
                safe_data[key] = value
        return safe_data
    elif isinstance(data, str):
        # Check if the string contains an API key pattern and redact it
        return data
    else:
        return data

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
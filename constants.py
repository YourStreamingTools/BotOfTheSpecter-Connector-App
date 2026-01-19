import os
import logging
import requests
import sys
import io

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
VERSION = "1.2"
SPECTER_WEBSOCKET_URI = "https://websocket.botofthespecter.com"
ICON_URL = "https://cdn.botofthespecter.com/logo.png"

# WebSocket Configuration
RECONNECT_DELAY = 60  # Fixed 60 second delay for each reconnection attempt
CONNECTION_TIMEOUT = 30  # 30 second timeout for connection + registration
JITTER_RANGE = (0, 5)  # 0-5 second jitter to prevent simultaneous reconnections

# Setup logging
def setup_logging():
    # Root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    # File handler with UTF-8 encoding
    try:
        file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        print(f"Failed to create file handler: {e}")
    # Helper: safe stream wrapper to avoid exceptions when sys.stdout/sys.stderr are closed
    class _SafeStream:
        def __init__(self, stream):
            self._stream = stream
        def write(self, s):
            try:
                return self._stream.write(s)
            except Exception:
                return 0
        def flush(self):
            try:
                return self._stream.flush()
            except Exception:
                return None

    # Stream handler wrapping stdout in utf-8 with replace errors to avoid UnicodeEncodeError
    try:
        stream_handler = None
        if hasattr(sys, 'stdout') and hasattr(sys.stdout, 'buffer') and not sys.stdout.closed:
            try:
                stream = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
                stream_handler = logging.StreamHandler(stream=_SafeStream(stream))
            except Exception:
                stream_handler = None
        if stream_handler is None:
            # Fallback to a stream handler using an in-memory buffer wrapped by SafeStream
            stream_handler = logging.StreamHandler(stream=_SafeStream(io.StringIO()))
        stream_handler.setLevel(logging.INFO)
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)
    except Exception as e:
        # Use logging to report the error; avoid print which may be using a closed stdout
        fallback_log = logging.getLogger(__name__)
        fallback_log.error(f"Failed to create stream handler: {e}")
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
        obs_events_handler = logging.FileHandler(OBS_EVENTS_LOG_FILE, encoding='utf-8')
        obs_events_handler.setLevel(logging.INFO)
        obs_events_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        obs_events_handler.setFormatter(obs_events_formatter)
        obs_events_logger.addHandler(obs_events_handler)
    except Exception as e:
        print(f"Failed to create OBS events file handler: {e}")
    # Console handler for debugging (wrap stdout in UTF-8 to avoid UnicodeEncodeError)
    class _SafeStream:
        def __init__(self, stream):
            self._stream = stream
        def write(self, s):
            try:
                return self._stream.write(s)
            except Exception:
                return 0
        def flush(self):
            try:
                return self._stream.flush()
            except Exception:
                return None
    try:
        console_handler = None
        if hasattr(sys, 'stdout') and hasattr(sys.stdout, 'buffer') and not sys.stdout.closed:
            try:
                stream = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
                console_handler = logging.StreamHandler(stream=_SafeStream(stream))
            except Exception:
                console_handler = None
        if console_handler is None:
            console_handler = logging.StreamHandler(stream=_SafeStream(io.StringIO()))
        console_handler.setLevel(logging.INFO)
        obs_events_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        console_handler.setFormatter(obs_events_formatter)
        obs_events_logger.addHandler(console_handler)
    except Exception as e:
        # Use the root logger to report the problem, print may fail if stdout is closed
        error_logger = logging.getLogger(__name__)
        error_logger.error(f"Failed to create OBS events console handler: {e}")
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
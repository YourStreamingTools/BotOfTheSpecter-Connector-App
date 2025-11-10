import time
from PyQt6.QtCore import QThread, pyqtSignal
import obswebsocket
from obswebsocket import requests as obs_requests
from constants import websocket_logger, bot_logger

class OBSConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)

    def __init__(self, host, port, password, bot_connector):
        super().__init__()
        self.host = host
        self.port = port
        self.password = password
        self.bot_connector = bot_connector
        self.client = obswebsocket.obsws(host, port, password)
        self.connected = False
        self.should_stop = False
        self.source_name_cache = {}

    def get_source_name(self, scene_name, item_id):
        cache_key = f"{scene_name}:{item_id}"
        if cache_key in self.source_name_cache:
            return self.source_name_cache[cache_key]
        try:
            if not self.connected:
                websocket_logger.info(f"Client not connected, cannot resolve source name")
                fallback = f'Item {item_id}'
                self.source_name_cache[cache_key] = fallback
                return fallback
            websocket_logger.info(f"Fetching scene items for '{scene_name}' to resolve item_id {item_id}")
            scene_items = self.client.call(obs_requests.GetSceneItemList(sceneName=scene_name))
            websocket_logger.info(f"Scene items response: {scene_items}")
            for item in scene_items.datain.get('sceneItems', []):
                if item.get('sceneItemId') == item_id:
                    source_name = item.get('sourceName', f'Item {item_id}')
                    websocket_logger.info(f"Resolved item {item_id} to source: {source_name}")
                    self.source_name_cache[cache_key] = source_name
                    return source_name
            websocket_logger.info(f"Item {item_id} not found in scene '{scene_name}'")
            fallback = f'Item {item_id}'
            self.source_name_cache[cache_key] = fallback
            return fallback
        except Exception as e:
            websocket_logger.error(f"Exception in get_source_name for scene '{scene_name}', item {item_id}: {e}", exc_info=True)
            fallback = f'Item {item_id}'
            self.source_name_cache[cache_key] = fallback
            return fallback

    def on_event(self, event):
        event_type = event.__class__.__name__
        data = event.__dict__.get('datain', event.__dict__)
        websocket_logger.info(f"OBS Event received: {event_type} - {data}")
        message = None
        if event_type == 'SceneItemEnableStateChanged':
            scene_name = data.get('sceneName', 'Unknown Scene')
            item_id = data.get('sceneItemId', '?')
            enabled = data.get('sceneItemEnabled', False)
            icon = "👁️" if enabled else "👁️‍🗨️"
            cache_key = f"{scene_name}:{item_id}"
            if cache_key in self.source_name_cache:
                source_name = self.source_name_cache[cache_key]
            else:
                source_name = f'Item {item_id}'
            message = f"{icon} {source_name} in {scene_name}"
        elif event_type == 'CurrentProgramSceneChanged':
            scene_name = data.get('sceneName', 'Unknown')
            message = f"🎬 Scene changed to: {scene_name}"
        elif event_type == 'SceneTransitionStarted':
            transition = data.get('transitionName', 'Unknown')
            message = f"🔄 Transition started: {transition}"
        elif event_type == 'SceneTransitionEnded':
            transition = data.get('transitionName', 'Unknown')
            message = f"✓ Transition ended: {transition}"
        elif event_type == 'SceneTransitionVideoEnded':
            transition = data.get('transitionName', 'Unknown')
            message = f"✓ Transition video ended: {transition}"
        elif event_type == 'SceneCreated':
            scene_name = data.get('sceneName', 'Unknown')
            message = f"✨ New scene created: {scene_name}"
        elif event_type == 'SceneRemoved':
            scene_name = data.get('sceneName', 'Unknown')
            message = f"🗑️ Scene removed: {scene_name}"
        elif event_type == 'SourceCreated':
            source_name = data.get('sourceName', 'Unknown')
            scene_name = data.get('sceneName', 'Unknown Scene')
            message = f"📦 Source created: {source_name} in {scene_name}"
        elif event_type == 'SourceRemoved':
            source_name = data.get('sourceName', 'Unknown')
            scene_name = data.get('sceneName', 'Unknown Scene')
            message = f"📦 Source removed: {source_name} from {scene_name}"
        elif event_type == 'RecordingStarted':
            message = f"🔴 Recording started"
        elif event_type == 'RecordingStopped':
            message = f"⏹️ Recording stopped"
        elif event_type == 'StreamStarted':
            message = f"📡 Streaming started"
        elif event_type == 'StreamStopped':
            message = f"📡 Streaming stopped"
        else:
            message = f"OBS Event: {event_type}"
        if message:
            websocket_logger.info(f"Emitting OBS event to GUI: {message}")
            self.event_received.emit(message)
        else:
            websocket_logger.warning(f"No message generated for event type: {event_type}")
        
        if self.bot_connector:
            self.bot_connector.send_event('OBS_EVENT', {'type': event_type, 'data': data})

    def handle_specter_event(self, event_name, data):
        try:
            message = f"Specter -> OBS event '{event_name}': {data}"
            self.event_received.emit(message)
        except Exception as e:
            self.event_received.emit(f"Error handling specter event '{event_name}': {e}")

    def precache_source_names(self):
        try:
            websocket_logger.info("Pre-caching source names from all scenes...")
            scenes_response = self.client.call(obs_requests.GetSceneList())
            scenes = scenes_response.datain.get('scenes', [])
            for scene in scenes:
                scene_name = scene.get('sceneName')
                try:
                    items_response = self.client.call(obs_requests.GetSceneItemList(sceneName=scene_name))
                    items = items_response.datain.get('sceneItems', [])
                    for item in items:
                        item_id = item.get('sceneItemId')
                        source_name = item.get('sourceName', f'Item {item_id}')
                        cache_key = f"{scene_name}:{item_id}"
                        self.source_name_cache[cache_key] = source_name
                        websocket_logger.debug(f"Cached: {cache_key} -> {source_name}")
                except Exception as scene_error:
                    websocket_logger.warning(f"Failed to cache items for scene '{scene_name}': {scene_error}")
            websocket_logger.info(f"Source name caching complete. Cached {len(self.source_name_cache)} entries")
        except Exception as e:
            websocket_logger.error(f"Failed to precache source names: {e}", exc_info=True)

    def run(self):
        try:
            self.client.connect()
            self.client.register(self.on_event)
            self.connected = True
            self.status_update.emit("Connected to OBS")
            try:
                self.precache_source_names()
            except Exception as e:
                websocket_logger.warning(f"Failed to precache source names: {e}")
            while not self.should_stop:
                try:
                    self.client.call(obs_requests.GetVersion())
                    time.sleep(1)
                except Exception as e:
                    if not self.should_stop:
                        websocket_logger.error(f"OBS keepalive error: {e}")
                    break
        except Exception as e:
            err_str = str(e)
            if '10061' in err_str or 'Connection refused' in err_str or isinstance(e, ConnectionRefusedError):
                user_msg = "Failed to connect to OBS — ensure OBS and its WebSocket server are running."
            else:
                user_msg = "Failed to connect to OBS."
            self.status_update.emit(user_msg)
            bot_logger.error(f"OBS connection error: {err_str}")

    def disconnect(self):
        self.should_stop = True
        if self.connected:
            try:
                self.client.disconnect()
            except Exception as e:
                websocket_logger.warning(f"Error disconnecting OBS client: {e}")
            self.connected = False
            self.status_update.emit("Disconnected from OBS")

    def perform_action(self, action):
        try:
            websocket_logger.info(f"OBSConnector.perform_action called with: {action}")
            if action.get('action') == 'set_scene_item_enabled':
                websocket_logger.info(f"Executing set_scene_item_enabled: scene={action.get('scene')}, item_id={action.get('item_id')}, enabled={action.get('enabled')}")
                req = obs_requests.SetSceneItemEnabled(
                    sceneName=action['scene'],
                    sceneItemId=action['item_id'],
                    sceneItemEnabled=action['enabled']
                )
                self.client.call(req)
                self.status_update.emit(f"Executed: {action}")
                websocket_logger.info(f"Successfully executed set_scene_item_enabled")
            elif action.get('action') == 'set_current_program_scene':
                websocket_logger.info(f"Executing set_current_program_scene: scene={action.get('scene')}")
                req = obs_requests.SetCurrentProgramScene(sceneName=action['scene'])
                self.client.call(req)
                self.status_update.emit(f"Executed: {action}")
                websocket_logger.info(f"Successfully executed set_current_program_scene")
            else:
                websocket_logger.warning(f"Unknown action: {action}")
                self.status_update.emit(f"Unknown action: {action}")
        except Exception as e:
            websocket_logger.error(f"perform_action error: {e}", exc_info=True)
            self.status_update.emit(f"Failed to execute action: {e}")
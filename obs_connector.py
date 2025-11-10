import time
from PyQt6.QtCore import QThread, pyqtSignal
import obswebsocket
from obswebsocket import requests as obs_requests
import constants
from constants import websocket_logger, bot_logger, redact_sensitive_data
import threading

class OBSConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)
    stats_update = pyqtSignal(dict)  # Signal for periodic stats updates

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

    def query_stream_stats(self):
        try:
            if not self.connected:
                return
            obs_events_logger = constants.obs_events_logger
            # Get stream status with bitrate
            stream_resp = self.client.call(obs_requests.GetStreamStatus())
            stream_data = stream_resp.datain if stream_resp.datain else {}
            # Get record status  
            record_resp = self.client.call(obs_requests.GetRecordStatus())
            record_data = record_resp.datain if record_resp.datain else {}
            # Get stats
            stats_resp = self.client.call(obs_requests.GetStats())
            stats_data = stats_resp.datain if stats_resp.datain else {}
            if obs_events_logger:
                obs_events_logger.info(f"Stream Status: {stream_data}")
                obs_events_logger.info(f"Record Status: {record_data}")
                obs_events_logger.info(f"OBS Stats: {stats_data}")
        except Exception as e:
            websocket_logger.debug(f"Failed to query stream stats: {e}")

    def on_event(self, event):
        # Get the logger at runtime to ensure it's initialized
        obs_events_logger = constants.obs_events_logger
        event_type = event.__class__.__name__
        data = event.__dict__.get('datain', event.__dict__)
        # Redact sensitive data before logging
        redacted_data = redact_sensitive_data(data)
        # Log all events to dedicated OBS events log
        if obs_events_logger:
            obs_events_logger.info(f"=== OBS EVENT ===")
            obs_events_logger.info(f"Event Type: {event_type}")
            obs_events_logger.info(f"Event Data: {redacted_data}")
            # Query stats in a background thread to avoid blocking
            try:
                stats_thread = threading.Thread(target=self.query_stream_stats, daemon=True)
                stats_thread.start()
            except Exception as e:
                websocket_logger.debug(f"Failed to start stats thread: {e}")
            obs_events_logger.info(f"=================")
        # Also log to main websocket logger
        websocket_logger.info(f"OBS Event: {event_type} - {redacted_data}")
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
            self.bot_connector.send_event('OBS_EVENT', {'type': event_type, 'data': redacted_data})

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
            websocket_logger.info(f"[SETUP] Registering on_event handler...")
            self.client.register(self.on_event)
            websocket_logger.info(f"[SETUP] on_event handler registered successfully")
            websocket_logger.info(f"[SETUP] EventManager functions: {self.client.eventmanager.functions}")
            websocket_logger.info(f"[SETUP] Receive thread: {self.client.thread_recv}")
            websocket_logger.info(f"[SETUP] Events dict: {self.client.events}")
            # Try to enable event subscriptions (OBS v28+)
            try:
                websocket_logger.info(f"[SETUP] Attempting to enable event subscriptions...")
                # Try calling Identify to enable events
                resp = self.client.call(obs_requests.Identify(rpcVersion=1, eventSubscriptions=33))  # 33 = all event mask
                websocket_logger.info(f"[SETUP] Identify response: {resp.datain if hasattr(resp, 'datain') else resp}")
            except Exception as e:
                websocket_logger.warning(f"[SETUP] Failed to enable event subscriptions: {e}")
            self.connected = True
            self.status_update.emit("Connected to OBS")
            try:
                self.precache_source_names()
            except Exception as e:
                websocket_logger.warning(f"Failed to precache source names: {e}")
            # Main connection loop - just keepalive, no polling for now
            while not self.should_stop:
                try:
                    self.client.call(obs_requests.GetVersion())
                    time.sleep(1)
                except Exception as e:
                    if not self.should_stop:
                        websocket_logger.error(f"OBS keepalive error: {e}", exc_info=True)
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

    def get_stream_status(self):
        try:
            if not self.connected:
                return {'streaming': False, 'recording': False, 'replay_buffer': False}
            streaming = False
            recording = False
            replay_buffer = False
            # Get streaming status
            try:
                stream_resp = self.client.call(obs_requests.GetStreamStatus())
                streaming = stream_resp.datain.get('outputActive', False)
            except:
                pass
            # Get recording status
            try:
                record_resp = self.client.call(obs_requests.GetRecordStatus())
                recording = record_resp.datain.get('outputActive', False)
            except:
                pass
            # Get replay buffer status
            try:
                replay_resp = self.client.call(obs_requests.GetReplayBufferStatus())
                replay_buffer = replay_resp.datain.get('outputActive', False)
            except:
                pass
            return {
                'streaming': streaming,
                'recording': recording,
                'replay_buffer': replay_buffer
            }
        except Exception as e:
            websocket_logger.warning(f"Failed to get stream status: {e}")
            return {'streaming': False, 'recording': False, 'replay_buffer': False}

    def get_recording_status(self):
        try:
            if not self.connected:
                return {'recording': False, 'file_name': '', 'duration': 0}
            response = self.client.call(obs_requests.GetRecordStatus())
            return {
                'recording': response.datain.get('outputActive', False),
                'file_name': response.datain.get('outputPath', ''),
                'duration': response.datain.get('outputDuration', 0)
            }
        except Exception as e:
            websocket_logger.warning(f"Failed to get recording status: {e}")
            return {'recording': False, 'file_name': '', 'duration': 0}

    def get_replay_buffer_status(self):
        try:
            if not self.connected:
                return {'enabled': False, 'active': False}
            response = self.client.call(obs_requests.GetReplayBufferStatus())
            return {
                'enabled': response.datain.get('outputActive', False),
                'active': response.datain.get('outputActive', False)
            }
        except Exception as e:
            websocket_logger.warning(f"Failed to get replay buffer status: {e}")
            return {'enabled': False, 'active': False}

    def get_stream_stats(self):
        try:
            if not self.connected:
                return {'bitrate': 0, 'fps': 0, 'sent_frames': 0, 'sent_bytes': 0}
            response = self.client.call(obs_requests.GetStats())
            stats_data = response.datain
            return {
                'bitrate': stats_data.get('outputTotalKbps', 0),
                'fps': stats_data.get('averageFrameTime', 0),
                'sent_frames': stats_data.get('renderTotalFrames', 0),
                'sent_bytes': stats_data.get('renderMissedFrames', 0)
            }
        except Exception as e:
            websocket_logger.warning(f"Failed to get stream stats: {e}")
            return {'bitrate': 0, 'fps': 0, 'sent_frames': 0, 'sent_bytes': 0}

    def get_output_status(self):
        try:
            if not self.connected:
                return {
                    'streaming': False,
                    'recording': False,
                    'replay_buffer': False,
                    'stream_bitrate': 0,
                    'stream_fps': 0,
                    'record_bitrate': 0,
                    'render_total_frames': 0,
                    'render_missed_frames': 0,
                    'output_total_frames': 0,
                    'output_skipped_frames': 0,
                    'average_frame_time': 0,
                    'cpu_usage': 0,
                    'memory_usage': 0,
                    'gpu_usage': 0
                }
            # Get stream bitrate from streaming output
            stream_bitrate = 0
            try:
                stream_status = self.client.call(obs_requests.GetStreamStatus())
                stream_bitrate = stream_status.datain.get('outputTotalKbps', 0)
            except:
                pass
            # Get recording bitrate from recording output
            record_bitrate = 0
            try:
                record_status = self.client.call(obs_requests.GetRecordStatus())
                record_bitrate = record_status.datain.get('outputTotalKbps', 0)
            except:
                pass
            # Get general stats
            stats_response = self.client.call(obs_requests.GetStats())
            stats_data = stats_response.datain
            return {
                'streaming': False,
                'recording': False,
                'replay_buffer': False,
                'stream_bitrate': stream_bitrate,
                'stream_fps': stats_data.get('averageFrameTime', 0),
                'record_bitrate': record_bitrate,
                'render_total_frames': stats_data.get('renderTotalFrames', 0),
                'render_missed_frames': stats_data.get('renderMissedFrames', 0),
                'output_total_frames': stats_data.get('outputTotalFrames', 0),
                'output_skipped_frames': stats_data.get('outputSkippedFrames', 0),
                'average_frame_time': stats_data.get('averageFrameTime', 0),
                'cpu_usage': stats_data.get('cpuUsage', 0),
                'memory_usage': stats_data.get('memoryUsage', 0),
                'gpu_usage': stats_data.get('gpuUsage', 0)
            }
        except Exception as e:
            websocket_logger.warning(f"Failed to get output status: {e}")
            return {
                'streaming': False,
                'recording': False,
                'replay_buffer': False,
                'stream_bitrate': 0,
                'stream_fps': 0,
                'record_bitrate': 0,
                'render_total_frames': 0,
                'render_missed_frames': 0,
                'output_total_frames': 0,
                'output_skipped_frames': 0,
                'average_frame_time': 0,
                'cpu_usage': 0,
                'memory_usage': 0,
                'gpu_usage': 0
            }
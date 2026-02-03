import time
from PyQt6.QtCore import QThread, pyqtSignal
import obswebsocket
from obswebsocket import requests as obs_requests
import constants
from constants import websocket_logger, bot_logger, redact_sensitive_data
import threading
import queue

class OBSConnector(QThread):
    status_update = pyqtSignal(str)
    event_received = pyqtSignal(str)
    scenes_updated = pyqtSignal(dict)  # Signal with scenes mapping to sources
    action_requested = pyqtSignal(object)  # request to run an action on the connector thread
    refresh_requested = pyqtSignal()
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
        # Action queue for cross-thread requests from UI or Bot
        self._action_queue = queue.Queue()
        # Connect signals intended to be emitted from other threads (UI or bot) to enqueue actions
        try:
            self.action_requested.connect(self._enqueue_action)
        except Exception:
            pass
        try:
            self.refresh_requested.connect(lambda: self._enqueue_action({'_action': 'refresh'}))
        except Exception:
            pass
        # Store latest bitrate values calculated from stream/record status
        self.latest_stream_bitrate = 0
        self.latest_record_bitrate = 0
        # Track previous values for delta calculation
        self.prev_stream_bytes = 0
        self.prev_stream_duration_ms = 0
        self.prev_record_bytes = 0
        self.prev_record_duration_ms = 0

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
            # Calculate stream bitrate: (bytes * 8 bits/byte) / (duration in seconds) = bits/second / 1000 = kbps
            try:
                stream_bytes = stream_data.get('outputBytes', 0)
                stream_duration_ms = stream_data.get('outputDuration', 0)
                if stream_bytes > 0 and stream_duration_ms > 0:
                    stream_bitrate_kbps = (stream_bytes * 8) / (stream_duration_ms / 1000) / 1000
                    self.latest_stream_bitrate = stream_bitrate_kbps
                    websocket_logger.info(f"Stream Bitrate Calculated: {stream_bitrate_kbps:.2f} Kbps")
            except Exception as calc_err:
                websocket_logger.debug(f"Failed to calculate stream bitrate: {calc_err}")
            # Calculate record bitrate: (bytes * 8 bits/byte) / (duration in seconds) = bits/second / 1000 = kbps
            try:
                record_bytes = record_data.get('outputBytes', 0)
                record_duration_ms = record_data.get('outputDuration', 0)
                if record_bytes > 0 and record_duration_ms > 0:
                    record_bitrate_kbps = (record_bytes * 8) / (record_duration_ms / 1000) / 1000
                    self.latest_record_bitrate = record_bitrate_kbps
                    websocket_logger.info(f"Record Bitrate Calculated: {record_bitrate_kbps:.2f} Kbps")
            except Exception as calc_err:
                websocket_logger.debug(f"Failed to calculate record bitrate: {calc_err}")
            if obs_events_logger:
                obs_events_logger.info(f"Stream Status: {stream_data}")
                obs_events_logger.info(f"Record Status: {record_data}")
                obs_events_logger.info(f"OBS Stats: {stats_data}")
        except Exception as e:
            websocket_logger.error(f"Failed to query stream stats: {e}", exc_info=True)

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
        # If important scene/source changes happened, refresh our cache and notify UI
        try:
            if event_type in ('SceneCreated', 'SceneRemoved', 'SourceCreated', 'SourceRemoved', 'SceneItemEnableStateChanged', 'SourceEnableStateChanged'):
                websocket_logger.info(f"Event {event_type} can change scene/source layout; refreshing cache")
                try:
                    self.precache_source_names()
                except Exception as precache_err:
                    websocket_logger.debug(f"Failed to update scene cache on event {event_type}: {precache_err}")
        except Exception:
            pass

    def handle_specter_event(self, event_name, data):
        try:
            message = f"Specter -> OBS event '{event_name}': {data}"
            self.event_received.emit(message)
        except Exception as e:
            self.event_received.emit(f"Error handling specter event '{event_name}': {e}")

    def precache_source_names(self):
        try:
            if not self.connected:
                websocket_logger.debug("Cannot precache source names - OBS client not connected yet")
                return
            websocket_logger.info("Pre-caching source names from all scenes...")
            scenes_response = self.client.call(obs_requests.GetSceneList())
            scenes = scenes_response.datain.get('scenes', [])
            scene_sources = {}
            for scene in scenes:
                scene_name = scene.get('sceneName')
                try:
                    items_response = self.client.call(obs_requests.GetSceneItemList(sceneName=scene_name))
                    items = items_response.datain.get('sceneItems', [])
                    scene_sources.setdefault(scene_name, [])
                    for item in items:
                        item_id = item.get('sceneItemId')
                        source_name = item.get('sourceName', f'Item {item_id}')
                        enabled = item.get('sceneItemEnabled', False)
                        cache_key = f"{scene_name}:{item_id}"
                        self.source_name_cache[cache_key] = source_name
                        scene_sources[scene_name].append({'name': source_name, 'id': item_id, 'enabled': enabled})
                        websocket_logger.debug(f"Cached: {cache_key} -> {source_name} (enabled={enabled})")
                except Exception as scene_error:
                    websocket_logger.warning(f"Failed to cache items for scene '{scene_name}': {scene_error}")
            websocket_logger.info(f"Source name caching complete. Cached {len(self.source_name_cache)} entries")
            # Emit the scenes->sources mapping for UI consumption
            try:
                self.scenes_updated.emit(scene_sources)
            except Exception as e:
                websocket_logger.debug(f"Failed to emit scenes_updated signal: {e}")
        except Exception as e:
            websocket_logger.error(f"Failed to precache source names: {e}", exc_info=True)

    def _enqueue_action(self, action):
        try:
            self._action_queue.put(action)
            websocket_logger.debug(f"Enqueued action: {action}")
            try:
                # Inform UI that action was queued
                self.event_received.emit(f"Queued action: {action}")
            except Exception:
                pass
        except Exception as e:
            websocket_logger.error(f"Failed to enqueue action: {e}")

    def _handle_action_request(self, action):
        try:
            # The slot should run on the thread of this QThread (OBSConnector)
            websocket_logger.info(f"_handle_action_request processing: {action}")
            self.perform_action(action)
        except Exception as e:
            websocket_logger.error(f"_handle_action_request error: {e}", exc_info=True)
            try:
                self.event_received.emit(f"Action request failed: {e}")
            except Exception:
                pass

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
            # Main connection loop - poll for status updates periodically
            while not self.should_stop:
                try:
                    # Gather output status and emit via signal for the UI to consume
                    status = self.get_output_status()
                    try:
                        self.stats_update.emit(status)
                    except Exception as e:
                        websocket_logger.debug(f"Failed to emit stats_update: {e}")
                    # Process any queued actions requested from UI or bot
                    try:
                        while not self._action_queue.empty():
                            action = self._action_queue.get_nowait()
                            if isinstance(action, dict) and action.get('_action') == 'refresh':
                                try:
                                    self.precache_source_names()
                                except Exception as e:
                                    websocket_logger.error(f"Failed to refresh scenes on queue: {e}", exc_info=True)
                            else:
                                try:
                                    self.perform_action(action)
                                except Exception as e:
                                    websocket_logger.error(f"Failed to execute queued action: {e}", exc_info=True)
                    except Exception as e:
                        websocket_logger.debug(f"Error processing action queue: {e}")
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
        finally:
            # Ensure websocket client is disconnected from the worker thread
            try:
                if hasattr(self, 'client') and self.client and getattr(self.client, 'connected', False):
                    try:
                        self.client.disconnect()
                        websocket_logger.info("OBS client disconnected cleanly from worker thread")
                    except Exception as e:
                        websocket_logger.warning(f"Error while disconnecting client in worker thread: {e}")
            except Exception as e:
                websocket_logger.warning(f"Unexpected error in cleanup: {e}")
            # Mark as disconnected and notify UI
            if self.connected:
                self.connected = False
            try:
                self.status_update.emit("Disconnected from OBS")
            except Exception:
                pass

    def disconnect(self):
        self.should_stop = True
        # If we are connected, emit a friendly status while the worker
        # thread performs the actual network disconnect.
        if self.connected:
            self.status_update.emit("Disconnecting from OBS")
        else:
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
                # Emit success to UI event log and status
                self.status_update.emit(f"Executed: {action}")
                try:
                    self.event_received.emit(f"Executed: {action}")
                except Exception:
                    pass
                websocket_logger.info(f"Successfully executed set_scene_item_enabled")
            elif action.get('action') == 'set_current_program_scene':
                websocket_logger.info(f"Executing set_current_program_scene: scene={action.get('scene')}")
                req = obs_requests.SetCurrentProgramScene(sceneName=action['scene'])
                self.client.call(req)
                self.status_update.emit(f"Executed: {action}")
                try:
                    self.event_received.emit(f"Executed: {action}")
                except Exception:
                    pass
                websocket_logger.info(f"Successfully executed set_current_program_scene")
            else:
                websocket_logger.warning(f"Unknown action: {action}")
                try:
                    self.event_received.emit(f"Unknown action: {action}")
                except Exception:
                    pass
                self.status_update.emit(f"Unknown action: {action}")
        except Exception as e:
            websocket_logger.error(f"perform_action error: {e}", exc_info=True)
            try:
                self.event_received.emit(f"Failed to execute action: {action} - {e}")
            except Exception:
                pass
            self.status_update.emit(f"Failed to execute action: {e}")

    def start_stream(self):
        try:
            self.client.call(obs_requests.StartStream())
            websocket_logger.info("Started stream")
            self.status_update.emit("Stream started")
        except Exception as e:
            websocket_logger.error(f"Failed to start stream: {e}")
            self.status_update.emit(f"Failed to start stream: {e}")

    def stop_stream(self):
        try:
            self.client.call(obs_requests.StopStream())
            websocket_logger.info("Stopped stream")
            self.status_update.emit("Stream stopped")
        except Exception as e:
            websocket_logger.error(f"Failed to stop stream: {e}")
            self.status_update.emit(f"Failed to stop stream: {e}")

    def start_recording(self):
        try:
            self.client.call(obs_requests.StartRecord())
            websocket_logger.info("Started recording")
            self.status_update.emit("Recording started")
        except Exception as e:
            websocket_logger.error(f"Failed to start recording: {e}")
            self.status_update.emit(f"Failed to start recording: {e}")

    def stop_recording(self):
        try:
            self.client.call(obs_requests.StopRecord())
            websocket_logger.info("Stopped recording")
            self.status_update.emit("Recording stopped")
        except Exception as e:
            websocket_logger.error(f"Failed to stop recording: {e}")
            self.status_update.emit(f"Failed to stop recording: {e}")

    def save_replay_buffer(self):
        try:
            self.client.call(obs_requests.SaveReplayBuffer())
            websocket_logger.info("Saved replay buffer")
            self.status_update.emit("Replay buffer saved")
        except Exception as e:
            websocket_logger.error(f"Failed to save replay buffer: {e}")
            self.status_update.emit(f"Failed to save replay buffer: {e}")

    def toggle_virtual_camera(self):
        try:
            self.client.call(obs_requests.ToggleVirtualCam())
            websocket_logger.info("Toggled virtual camera")
            self.status_update.emit("Virtual camera toggled")
        except Exception as e:
            websocket_logger.error(f"Failed to toggle virtual camera: {e}")
            self.status_update.emit(f"Failed to toggle virtual camera: {e}")

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
            # Initialize status variables
            streaming = False
            recording = False
            replay_buffer = False
            # Query stream and record status to get fresh bitrate data
            try:
                stream_resp = self.client.call(obs_requests.GetStreamStatus())
                stream_data = stream_resp.datain if stream_resp.datain else {}
                stream_bytes = stream_data.get('outputBytes', 0)
                stream_duration_ms = stream_data.get('outputDuration', 0)
                streaming = stream_data.get('outputActive', False)  # Extract actual streaming status
                websocket_logger.debug(f"Stream data - bytes: {stream_bytes}, duration: {stream_duration_ms}ms, active: {streaming}")
                # Calculate bitrate based on delta (change) in bytes and duration since last check
                if stream_bytes > self.prev_stream_bytes and stream_duration_ms > self.prev_stream_duration_ms:
                    delta_bytes = stream_bytes - self.prev_stream_bytes
                    delta_duration_ms = stream_duration_ms - self.prev_stream_duration_ms
                    if delta_duration_ms > 0:
                        stream_bitrate_kbps = (delta_bytes * 8) / (delta_duration_ms / 1000) / 1000
                        self.latest_stream_bitrate = stream_bitrate_kbps
                        websocket_logger.info(f"Updated stream bitrate: {stream_bitrate_kbps:.2f} Kbps (delta: {delta_bytes} bytes / {delta_duration_ms}ms)")
                self.prev_stream_bytes = stream_bytes
                self.prev_stream_duration_ms = stream_duration_ms
            except Exception as e:
                websocket_logger.debug(f"Failed to query stream status for bitrate: {e}")
            try:
                record_resp = self.client.call(obs_requests.GetRecordStatus())
                record_data = record_resp.datain if record_resp.datain else {}
                record_bytes = record_data.get('outputBytes', 0)
                record_duration_ms = record_data.get('outputDuration', 0)
                recording = record_data.get('outputActive', False)  # Extract actual recording status
                websocket_logger.info(f"Record data - bytes: {record_bytes}, duration: {record_duration_ms}ms, active: {recording}")
                # Calculate bitrate based on delta (change) in bytes and duration since last check
                if record_bytes > self.prev_record_bytes and record_duration_ms > self.prev_record_duration_ms:
                    delta_bytes = record_bytes - self.prev_record_bytes
                    delta_duration_ms = record_duration_ms - self.prev_record_duration_ms
                    if delta_duration_ms > 0:
                        record_bitrate_kbps = (delta_bytes * 8) / (delta_duration_ms / 1000) / 1000
                        self.latest_record_bitrate = record_bitrate_kbps
                        websocket_logger.info(f"Updated record bitrate: {record_bitrate_kbps:.2f} Kbps (delta: {delta_bytes} bytes / {delta_duration_ms}ms)")
                self.prev_record_bytes = record_bytes
                self.prev_record_duration_ms = record_duration_ms
            except Exception as e:
                websocket_logger.debug(f"Failed to query record status for bitrate: {e}")
            # Get replay buffer status
            try:
                replay_resp = self.client.call(obs_requests.GetReplayBufferStatus())
                replay_data = replay_resp.datain if replay_resp.datain else {}
                replay_buffer = replay_data.get('outputActive', False)  # Extract actual replay buffer status
            except Exception as e:
                websocket_logger.debug(f"Failed to query replay buffer status: {e}")
            # Get general stats
            stats_response = self.client.call(obs_requests.GetStats())
            stats_data = stats_response.datain
            websocket_logger.info(f"Returning status - Streaming: {streaming}, Recording: {recording}, Replay: {replay_buffer}, Stream bitrate: {self.latest_stream_bitrate:.2f} Kbps, Record bitrate: {self.latest_record_bitrate:.2f} Kbps")
            return {
                'streaming': streaming,
                'recording': recording,
                'replay_buffer': replay_buffer,
                'stream_bitrate': self.latest_stream_bitrate,
                'stream_fps': stats_data.get('averageFrameTime', 0),
                'record_bitrate': self.latest_record_bitrate,
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
//! WebSocket server that accepts a single DAW client connection.
//!
//! - Listens on `127.0.0.1:<port>` (default 9851).
//! - Only one connection is active at a time.
//! - Text frames are parsed as JSON protocol messages.
//! - Binary frames are reserved for audio (echoed back as a placeholder).

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

use crate::audio_thread::{AudioFrame, AudioStreamManager};
use crate::error::Result;
use crate::host_impl::ParamChangeCollector;
use crate::plugin_host::PluginHost;
use crate::plugin_scanner::PluginScanner;
use crate::preset_storage::PresetStorage;
use crate::protocol::{IncomingMessage, OutgoingMessage, ParamChangeEntry};


/// Shared application state accessible from every connection handler.
pub struct AppState {
    pub scanner: PluginScanner,
    pub host: PluginHost,
    pub param_collector: ParamChangeCollector,
    pub audio_streams: AudioStreamManager,
    pub preset_storage: PresetStorage,
}

/// Start the WebSocket server and listen for connections forever.
pub async fn run(addr: SocketAddr) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    info!("ACE-Step Companion v0.1.0 listening on ws://{addr}");

    let mut audio_streams = AudioStreamManager::new();
    let audio_frame_rx = audio_streams
        .take_frame_receiver()
        .expect("audio frame receiver already taken");

    let preset_storage = PresetStorage::new().map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
    })?;
    let state = Arc::new(AppState {
        scanner: PluginScanner::new(),
        host: PluginHost::new(),
        param_collector: ParamChangeCollector::new(),
        audio_streams,
        preset_storage,
    });

    // Wrap the receiver in an Arc<Mutex> so it can be shared across connections
    // (only one active connection at a time, but the type needs to be cloneable).
    let audio_frame_rx = Arc::new(tokio::sync::Mutex::new(audio_frame_rx));

    loop {
        let (stream, peer) = listener.accept().await?;
        info!(%peer, "New TCP connection");
        let state = Arc::clone(&state);
        let rx = Arc::clone(&audio_frame_rx);

        // Spawn a task per connection but we expect only one DAW client.
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, peer, state, rx).await {
                error!(%peer, "Connection error: {e}");
            }
            info!(%peer, "Connection closed");
        });
    }
}

/// Handle a single WebSocket connection.
///
/// Runs two concurrent loops:
/// 1. Reads incoming messages from the client and dispatches responses.
/// 2. Periodically drains the parameter change queue and sends batched updates.
async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    state: Arc<AppState>,
    audio_frame_rx: Arc<tokio::sync::Mutex<crossbeam::channel::Receiver<AudioFrame>>>,
) -> Result<()> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    info!(%peer, "WebSocket handshake complete");

    let (mut sink, mut stream) = ws_stream.split();
    let mut param_interval = tokio::time::interval(Duration::from_millis(10));
    let mut audio_interval = tokio::time::interval(Duration::from_millis(1));

    loop {
        tokio::select! {
            // Branch 1: incoming message from client
            msg_result = stream.next() => {
                let msg = match msg_result {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => {
                        warn!(%peer, "Read error: {e}");
                        break;
                    }
                    None => break, // stream ended
                };

                match msg {
                    Message::Text(text) => {
                        info!(%peer, "Received text: {text}");
                        match serde_json::from_str::<IncomingMessage>(&text) {
                            Ok(incoming) => {
                                let response = handle_message(incoming, &state);
                                let json = serde_json::to_string(&response)?;
                                sink.send(Message::Text(json.into())).await?;
                            }
                            Err(e) => {
                                warn!(%peer, "Failed to parse message: {e}");
                                let err = OutgoingMessage::Error {
                                    req_id: None,
                                    instance_id: None,
                                    code: "parse_error".into(),
                                    message: format!("Invalid message: {e}"),
                                };
                                let json = serde_json::to_string(&err)?;
                                sink.send(Message::Text(json.into())).await?;
                            }
                        }
                    }
                    Message::Binary(data) => {
                        info!(%peer, bytes = data.len(), "Received binary frame (echo)");
                        sink.send(Message::Binary(data)).await?;
                    }
                    Message::Ping(payload) => {
                        sink.send(Message::Pong(payload)).await?;
                    }
                    Message::Close(_) => {
                        info!(%peer, "Client sent close frame");
                        break;
                    }
                    _ => {}
                }
            }

            // Branch 2: periodic drain of parameter changes from plugins
            _ = param_interval.tick() => {
                let changes = state.param_collector.drain();
                if changes.is_empty() {
                    continue;
                }
                debug!(%peer, count = changes.len(), "Forwarding param changes");
                let batch = OutgoingMessage::ParamsBatch {
                    changes: changes.into_iter().map(ParamChangeEntry::from).collect(),
                };
                let json = serde_json::to_string(&batch)?;
                sink.send(Message::Text(json.into())).await?;
            }

            // Branch 3: forward audio frames as WebSocket binary messages
            _ = audio_interval.tick() => {
                let rx = audio_frame_rx.lock().await;
                // Drain all available frames without blocking
                while let Ok(frame) = rx.try_recv() {
                    let binary = frame.encode();
                    sink.send(Message::Binary(binary.into())).await?;
                }
            }
        }
    }

    Ok(())
}

/// Build an error response scoped to an instance.
fn instance_error(instance_id: String, code: &str, message: String) -> OutgoingMessage {
    OutgoingMessage::Error {
        req_id: None,
        instance_id: Some(instance_id),
        code: code.into(),
        message,
    }
}

/// Dispatch an incoming protocol message and produce a response.
fn handle_message(msg: IncomingMessage, state: &AppState) -> OutgoingMessage {
    match msg {
        IncomingMessage::Hello { version, .. } => {
            info!(client_version = %version, "Hello from browser");
            OutgoingMessage::HelloAck {
                version: "0.1.0".into(),
                capabilities: vec![
                    "scan".into(),
                    "host".into(),
                    "midi".into(),
                    "state".into(),
                ],
            }
        }

        IncomingMessage::ScanPlugins => {
            let dirs = PluginScanner::default_search_dirs();
            let plugins = state.scanner.scan(&dirs);
            OutgoingMessage::ScanComplete { plugins }
        }

        IncomingMessage::Instantiate {
            req_id,
            plugin_uid,
            instance_id,
        } => {
            // Look up plugin path from scanner cache
            let dirs = PluginScanner::default_search_dirs();
            let plugins = state.scanner.scan(&dirs);
            let plugin_path = plugins.iter()
                .find(|p| p.uid == plugin_uid)
                .map(|p| std::path::PathBuf::from(&p.path));

            match state.host.instantiate(&plugin_uid, &instance_id, plugin_path.as_deref()) {
            Ok(info) => OutgoingMessage::Instantiated {
                req_id,
                instance_id: info.instance_id,
                parameters: info.parameters,
                latency_samples: info.latency_samples,
                tail_samples: info.tail_samples,
                presets: info.presets,
            },
            Err(e) => OutgoingMessage::Error {
                req_id: Some(req_id),
                instance_id: Some(instance_id),
                code: "instantiate_error".into(),
                message: e.to_string(),
            },
        }},

        IncomingMessage::Destroy { instance_id } => match state.host.destroy(&instance_id) {
            Ok(()) => OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: "Instance destroyed".into(),
            },
            Err(e) => OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "destroy_error".into(),
                message: e.to_string(),
            },
        },

        IncomingMessage::SetParam {
            instance_id,
            param_id,
            value,
        } => match state.host.set_parameter(&instance_id, param_id, value) {
            Ok(()) => OutgoingMessage::ParamChanged {
                instance_id,
                param_id,
                value,
            },
            Err(e) => OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "set_param_error".into(),
                message: e.to_string(),
            },
        }

        IncomingMessage::Midi {
            instance_id,
            events,
        } => {
            info!(instance_id, count = events.len(), "MIDI events (stub)");
            // No response required for MIDI in the current protocol; send an ack-style message.
            OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: format!("Received {} MIDI events (stub)", events.len()),
            }
        }

        IncomingMessage::OpenEditor { instance_id } => {
            info!(instance_id, "OpenEditor (stub)");
            OutgoingMessage::EditorOpened {
                instance_id,
                width: 800,
                height: 600,
            }
        }

        IncomingMessage::CloseEditor { instance_id } => {
            info!(instance_id, "CloseEditor (stub)");
            OutgoingMessage::EditorClosed { instance_id }
        }

        IncomingMessage::GetState { instance_id } => {
            match state.host.get_state(&instance_id) {
                Ok(bytes) => OutgoingMessage::StateData {
                    instance_id,
                    data: base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &bytes,
                    ),
                },
                Err(e) => OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "get_state_error".into(),
                    message: e.to_string(),
                },
            }
        }

        IncomingMessage::SetState {
            instance_id,
            data,
        } => {
            let bytes = match base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                &data,
            ) {
                Ok(b) => b,
                Err(e) => {
                    return OutgoingMessage::Error {
                        req_id: None,
                        instance_id: Some(instance_id),
                        code: "set_state_error".into(),
                        message: format!("Invalid base64 data: {e}"),
                    };
                }
            };
            match state.host.set_state(&instance_id, &bytes) {
                Ok(()) => OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "ok".into(),
                    message: "State set".into(),
                },
                Err(e) => OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "set_state_error".into(),
                    message: e.to_string(),
                },
            }
        }

        IncomingMessage::LoadPreset {
            instance_id,
            preset_id,
            name,
        } => {
            if let Some(preset_name) = name {
                // Name-based preset: load from disk and apply via setState
                let plugin_uid = match state.host.get_plugin_uid(&instance_id) {
                    Ok(uid) => uid,
                    Err(e) => return instance_error(instance_id, "load_preset_error", e.to_string()),
                };
                let state_bytes = match state.preset_storage.load(&plugin_uid, &preset_name) {
                    Ok(bytes) => bytes,
                    Err(e) => return instance_error(instance_id, "load_preset_error", e.to_string()),
                };
                match state.host.set_state(&instance_id, &state_bytes) {
                    Ok(()) => instance_error(instance_id, "ok", format!("Loaded preset '{preset_name}'")),
                    Err(e) => instance_error(instance_id, "load_preset_error", e.to_string()),
                }
            } else {
                let id = preset_id.unwrap_or(0);
                info!(%instance_id, id, "LoadPreset by ID (stub)");
                instance_error(instance_id, "ok", format!("Loaded preset {id} (stub)"))
            }
        }

        IncomingMessage::SetProcessing {
            instance_id,
            active,
        } => match state.host.set_processing(&instance_id, active) {
            Ok(()) => OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: format!("Processing set to {active}"),
            },
            Err(e) => OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "set_processing_error".into(),
                message: e.to_string(),
            },
        }

        IncomingMessage::GetLatency { instance_id } => {
            match state.host.get_latency(&instance_id) {
                Ok(samples) => OutgoingMessage::LatencyInfo {
                    instance_id,
                    samples,
                },
                Err(e) => OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "get_latency_error".into(),
                    message: e.to_string(),
                },
            }
        }

        IncomingMessage::SavePreset {
            instance_id,
            name,
        } => {
            let plugin_uid = match state.host.get_plugin_uid(&instance_id) {
                Ok(uid) => uid,
                Err(e) => return instance_error(instance_id, "save_preset_error", e.to_string()),
            };
            let state_bytes = match state.host.get_state(&instance_id) {
                Ok(bytes) => bytes,
                Err(e) => return instance_error(instance_id, "save_preset_error", e.to_string()),
            };
            match state.preset_storage.save(&plugin_uid, &name, &state_bytes) {
                Ok(()) => OutgoingMessage::PresetSaved { instance_id, name },
                Err(e) => instance_error(instance_id, "save_preset_error", e.to_string()),
            }
        }

        IncomingMessage::ListPresets { instance_id } => {
            let plugin_uid = match state.host.get_plugin_uid(&instance_id) {
                Ok(uid) => uid,
                Err(e) => return instance_error(instance_id, "list_presets_error", e.to_string()),
            };
            let presets = state.preset_storage.list(&plugin_uid);
            OutgoingMessage::PresetList { instance_id, presets }
        }

        IncomingMessage::DeletePreset {
            instance_id,
            name,
        } => {
            let plugin_uid = match state.host.get_plugin_uid(&instance_id) {
                Ok(uid) => uid,
                Err(e) => return instance_error(instance_id, "delete_preset_error", e.to_string()),
            };
            match state.preset_storage.delete(&plugin_uid, &name) {
                Ok(()) => OutgoingMessage::PresetDeleted { instance_id, name },
                Err(e) => instance_error(instance_id, "delete_preset_error", e.to_string()),
            }
        }

        IncomingMessage::RouteSidechain {
            instance_id,
            sidechain_input_bus,
            source_instance_id,
        } => {
            info!(
                instance_id,
                sidechain_input_bus, source_instance_id, "RouteSidechain (stub)"
            );
            OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: "Sidechain routed (stub)".into(),
            }
        }

        IncomingMessage::StartAudioStream {
            instance_id,
            sample_rate,
            block_size,
        } => {
            info!(instance_id, sample_rate, block_size, "StartAudioStream");
            if !state.host.has_instance(&instance_id) {
                return OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "start_stream_error".into(),
                    message: "Instance not found".into(),
                };
            }
            let started = state.audio_streams.start_stream(
                &instance_id,
                sample_rate,
                block_size,
                None, // Real plugin attachment is done separately
                true, // Default to instrument for stub
            );
            if started {
                OutgoingMessage::AudioStreamStarted { instance_id }
            } else {
                OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "start_stream_error".into(),
                    message: "Stream already active for this instance".into(),
                }
            }
        }

        IncomingMessage::StopAudioStream { instance_id } => {
            info!(instance_id, "StopAudioStream");
            let stopped = state.audio_streams.stop_stream(&instance_id);
            if stopped {
                OutgoingMessage::AudioStreamStopped { instance_id }
            } else {
                OutgoingMessage::Error {
                    req_id: None,
                    instance_id: Some(instance_id),
                    code: "stop_stream_error".into(),
                    message: "No active stream for this instance".into(),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;

    /// Create an `AppState` with a temp-dir-backed `PresetStorage` and audio stream manager.
    fn test_app_state() -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
            param_collector: ParamChangeCollector::new(),
            audio_streams: AudioStreamManager::new(),
            preset_storage: PresetStorage::with_base_dir(dir.path().to_path_buf()),
        };
        (dir, state)
    }

    /// Like `test_app_state` but also returns the audio frame receiver.
    fn test_app_state_with_audio() -> (tempfile::TempDir, AppState, crossbeam::channel::Receiver<AudioFrame>) {
        let dir = tempfile::tempdir().unwrap();
        let mut audio_streams = AudioStreamManager::new();
        let rx = audio_streams.take_frame_receiver().unwrap();
        let state = AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
            param_collector: ParamChangeCollector::new(),
            audio_streams,
            preset_storage: PresetStorage::with_base_dir(dir.path().to_path_buf()),
        };
        (dir, state, rx)
    }

    #[test]
    fn test_handle_message_hello() {
        let (_dir, state) = test_app_state();
        let resp = handle_message(
            IncomingMessage::Hello {
                version: "1.0".into(),
                sample_rate: 48000,
                block_size: 128,
            },
            &state,
        );
        match resp {
            OutgoingMessage::HelloAck {
                version,
                capabilities,
            } => {
                assert_eq!(version, "0.1.0");
                assert!(capabilities.contains(&"scan".to_string()));
            }
            other => panic!("Expected HelloAck, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_message_instantiate_and_destroy() {
        let (_dir, state) = test_app_state();

        let resp = handle_message(
            IncomingMessage::Instantiate {
                req_id: "r1".into(),
                plugin_uid: "uid-1".into(),
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::Instantiated { instance_id, .. } => {
                assert_eq!(instance_id, "inst-1");
            }
            other => panic!("Expected Instantiated, got {other:?}"),
        }

        let resp = handle_message(
            IncomingMessage::Destroy {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::Error { code, .. } => assert_eq!(code, "ok"),
            other => panic!("Expected ok Error, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_message_get_latency() {
        let (_dir, state) = test_app_state();
        // Must instantiate first so the instance exists
        state.host.instantiate("uid-1", "inst-1", None).unwrap();
        let resp = handle_message(
            IncomingMessage::GetLatency {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match resp {
            OutgoingMessage::LatencyInfo { samples, .. } => assert_eq!(samples, 0),
            other => panic!("Expected LatencyInfo, got {other:?}"),
        }
    }

    // Second test_app_state removed — use the unified one above.

    /// Integration test: start the WS server, connect, send hello, receive hello_ack.
    #[tokio::test]
    async fn test_ws_hello_handshake() {
        // Bind to port 0 to get an ephemeral port.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let (_dir, app_state, audio_rx) = test_app_state_with_audio();
        let state = Arc::new(app_state);
        let audio_frame_rx = Arc::new(tokio::sync::Mutex::new(audio_rx));

        // Spawn the accept loop.
        let server_state = Arc::clone(&state);
        let rx = Arc::clone(&audio_frame_rx);
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_connection(stream, peer, server_state, rx)
                .await
                .unwrap();
        });

        // Connect as a client.
        let url = format!("ws://{addr}");
        let (ws, _) = connect_async(&url).await.unwrap();
        let (mut sink, mut stream) = ws.split();

        // Send hello.
        let hello = serde_json::json!({
            "type": "hello",
            "version": "1.0",
            "sampleRate": 48000,
            "blockSize": 128
        });
        sink.send(Message::Text(hello.to_string().into()))
            .await
            .unwrap();

        // Receive hello_ack.
        let response = stream.next().await.unwrap().unwrap();
        let text = response.into_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["type"], "helloAck");
        assert_eq!(parsed["version"], "0.1.0");

        // Clean up.
        sink.send(Message::Close(None)).await.ok();
    }

    /// Integration test: push param changes to the collector and verify they arrive as a batch.
    #[tokio::test]
    async fn test_ws_param_batch_forwarding() {
        use crate::host_impl::HostParamChange;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let (_dir, app_state, audio_rx) = test_app_state_with_audio();
        let state = Arc::new(app_state);
        let audio_frame_rx = Arc::new(tokio::sync::Mutex::new(audio_rx));

        let server_state = Arc::clone(&state);
        let rx = Arc::clone(&audio_frame_rx);
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_connection(stream, peer, server_state, rx)
                .await
                .unwrap();
        });

        let url = format!("ws://{addr}");
        let (ws, _) = connect_async(&url).await.unwrap();
        let (mut sink, mut stream) = ws.split();

        // Push changes into the collector (simulating plugin GUI activity).
        state.param_collector.push(HostParamChange {
            instance_id: "inst-1".into(),
            param_id: 10,
            value: 0.42,
        });
        state.param_collector.push(HostParamChange {
            instance_id: "inst-2".into(),
            param_id: 20,
            value: 0.99,
        });

        // Wait for the periodic drain to fire (interval is 10ms, give it 100ms).
        let response = tokio::time::timeout(
            Duration::from_millis(200),
            stream.next(),
        )
        .await
        .expect("Timed out waiting for paramsBatch")
        .unwrap()
        .unwrap();

        let text = response.into_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["type"], "paramsBatch");

        let changes = parsed["changes"].as_array().unwrap();
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0]["instanceId"], "inst-1");
        assert_eq!(changes[0]["paramId"], 10);
        assert_eq!(changes[1]["instanceId"], "inst-2");
        assert_eq!(changes[1]["paramId"], 20);

        sink.send(Message::Close(None)).await.ok();
    }

    #[test]
    fn test_handle_message_start_audio_stream() {
        let (_dir, state) = test_app_state();
        // Must instantiate first
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        let resp = handle_message(
            IncomingMessage::StartAudioStream {
                instance_id: "inst-1".into(),
                sample_rate: 44100.0,
                block_size: 512,
            },
            &state,
        );
        match resp {
            OutgoingMessage::AudioStreamStarted { instance_id } => {
                assert_eq!(instance_id, "inst-1");
            }
            other => panic!("Expected AudioStreamStarted, got {other:?}"),
        }
        assert!(state.audio_streams.is_streaming("inst-1"));

        // Clean up
        state.audio_streams.stop_stream("inst-1");
    }

    #[test]
    fn test_handle_message_start_audio_stream_unknown_instance() {
        let (_dir, state) = test_app_state();

        let resp = handle_message(
            IncomingMessage::StartAudioStream {
                instance_id: "nonexistent".into(),
                sample_rate: 44100.0,
                block_size: 512,
            },
            &state,
        );
        match resp {
            OutgoingMessage::Error { code, .. } => assert_eq!(code, "start_stream_error"),
            other => panic!("Expected Error, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_message_stop_audio_stream() {
        let (_dir, state) = test_app_state();
        state.host.instantiate("uid-1", "inst-1", None).unwrap();
        state.audio_streams.start_stream("inst-1", 44100.0, 512, None, true);

        let resp = handle_message(
            IncomingMessage::StopAudioStream {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match resp {
            OutgoingMessage::AudioStreamStopped { instance_id } => {
                assert_eq!(instance_id, "inst-1");
            }
            other => panic!("Expected AudioStreamStopped, got {other:?}"),
        }
        assert!(!state.audio_streams.is_streaming("inst-1"));
    }

    #[test]
    fn test_handle_message_stop_audio_stream_not_streaming() {
        let (_dir, state) = test_app_state();

        let resp = handle_message(
            IncomingMessage::StopAudioStream {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match resp {
            OutgoingMessage::Error { code, .. } => assert_eq!(code, "stop_stream_error"),
            other => panic!("Expected Error, got {other:?}"),
        }
    }

    /// Integration test: start an audio stream and verify binary frames arrive over WebSocket.
    #[tokio::test]
    async fn test_ws_audio_stream_binary_frames() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let (_dir, app_state, audio_rx) = test_app_state_with_audio();
        let state = Arc::new(app_state);
        let audio_frame_rx = Arc::new(tokio::sync::Mutex::new(audio_rx));

        // Instantiate a stub plugin instance
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        let server_state = Arc::clone(&state);
        let rx = Arc::clone(&audio_frame_rx);
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_connection(stream, peer, server_state, rx)
                .await
                .unwrap();
        });

        let url = format!("ws://{addr}");
        let (ws, _) = connect_async(&url).await.unwrap();
        let (mut sink, mut stream) = ws.split();

        // Send startAudioStream
        let start_msg = serde_json::json!({
            "type": "startAudioStream",
            "instanceId": "inst-1",
            "sampleRate": 44100.0,
            "blockSize": 64
        });
        sink.send(Message::Text(start_msg.to_string().into()))
            .await
            .unwrap();

        // First response should be the JSON audioStreamStarted
        let response = tokio::time::timeout(Duration::from_millis(500), stream.next())
            .await
            .expect("Timed out waiting for audioStreamStarted")
            .unwrap()
            .unwrap();
        let text = response.into_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["type"], "audioStreamStarted");
        assert_eq!(parsed["instanceId"], "inst-1");

        // Wait for a binary frame to arrive
        let mut got_binary = false;
        for _ in 0..50 {
            let msg = tokio::time::timeout(Duration::from_millis(100), stream.next()).await;
            if let Ok(Some(Ok(Message::Binary(data)))) = msg {
                // Decode and verify
                let frame = AudioFrame::decode(&data).unwrap();
                assert_eq!(frame.instance_id, "inst-1");
                assert_eq!(frame.samples.len(), 128); // stereo * 64
                got_binary = true;
                break;
            }
        }
        assert!(got_binary, "Expected at least one binary audio frame");

        // Stop the stream
        let stop_msg = serde_json::json!({
            "type": "stopAudioStream",
            "instanceId": "inst-1"
        });
        sink.send(Message::Text(stop_msg.to_string().into()))
            .await
            .unwrap();

        // Clean up
        sink.send(Message::Close(None)).await.ok();
    }

    #[test]
    fn test_handle_save_and_list_presets() {
        let (_dir, state) = test_app_state();
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        // Save a preset
        let resp = handle_message(
            IncomingMessage::SavePreset {
                instance_id: "inst-1".into(),
                name: "My Patch".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::PresetSaved { instance_id, name } => {
                assert_eq!(instance_id, "inst-1");
                assert_eq!(name, "My Patch");
            }
            other => panic!("Expected PresetSaved, got {other:?}"),
        }

        // List presets
        let resp = handle_message(
            IncomingMessage::ListPresets {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::PresetList { instance_id, presets } => {
                assert_eq!(instance_id, "inst-1");
                assert_eq!(presets, &vec!["My Patch".to_string()]);
            }
            other => panic!("Expected PresetList, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_load_preset_by_name() {
        let (_dir, state) = test_app_state();
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        // Save a preset first
        handle_message(
            IncomingMessage::SavePreset {
                instance_id: "inst-1".into(),
                name: "Test Preset".into(),
            },
            &state,
        );

        // Load the preset by name
        let resp = handle_message(
            IncomingMessage::LoadPreset {
                instance_id: "inst-1".into(),
                preset_id: None,
                name: Some("Test Preset".into()),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::Error { code, message, .. } => {
                assert_eq!(code, "ok");
                assert!(message.contains("Test Preset"));
            }
            other => panic!("Expected ok Error, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_load_nonexistent_preset() {
        let (_dir, state) = test_app_state();
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        let resp = handle_message(
            IncomingMessage::LoadPreset {
                instance_id: "inst-1".into(),
                preset_id: None,
                name: Some("Nonexistent".into()),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::Error { code, .. } => {
                assert_eq!(code, "load_preset_error");
            }
            other => panic!("Expected error, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_delete_preset() {
        let (_dir, state) = test_app_state();
        state.host.instantiate("uid-1", "inst-1", None).unwrap();

        // Save then delete
        handle_message(
            IncomingMessage::SavePreset {
                instance_id: "inst-1".into(),
                name: "ToDelete".into(),
            },
            &state,
        );

        let resp = handle_message(
            IncomingMessage::DeletePreset {
                instance_id: "inst-1".into(),
                name: "ToDelete".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::PresetDeleted { name, .. } => {
                assert_eq!(name, "ToDelete");
            }
            other => panic!("Expected PresetDeleted, got {other:?}"),
        }

        // Verify it's gone
        let resp = handle_message(
            IncomingMessage::ListPresets {
                instance_id: "inst-1".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::PresetList { presets, .. } => {
                assert!(presets.is_empty());
            }
            other => panic!("Expected PresetList, got {other:?}"),
        }
    }

    #[test]
    fn test_handle_preset_unknown_instance_errors() {
        let (_dir, state) = test_app_state();

        let resp = handle_message(
            IncomingMessage::SavePreset {
                instance_id: "nonexistent".into(),
                name: "Test".into(),
            },
            &state,
        );
        match &resp {
            OutgoingMessage::Error { code, .. } => {
                assert_eq!(code, "save_preset_error");
            }
            other => panic!("Expected error, got {other:?}"),
        }
    }
}

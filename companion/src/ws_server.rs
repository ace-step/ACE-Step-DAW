//! WebSocket server that accepts a single DAW client connection.
//!
//! - Listens on `127.0.0.1:<port>` (default 9851).
//! - Only one connection is active at a time.
//! - Text frames are parsed as JSON protocol messages.
//! - Binary frames are reserved for audio (echoed back as a placeholder).

use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use crate::error::Result;
use crate::plugin_host::PluginHost;
use crate::plugin_scanner::PluginScanner;
use crate::protocol::{IncomingMessage, OutgoingMessage};

/// Shared application state accessible from every connection handler.
pub struct AppState {
    pub scanner: PluginScanner,
    pub host: PluginHost,
}

/// Start the WebSocket server and listen for connections forever.
pub async fn run(addr: SocketAddr) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    info!("ACE-Step Companion v0.1.0 listening on ws://{addr}");

    let state = Arc::new(AppState {
        scanner: PluginScanner::new(),
        host: PluginHost::new(),
    });

    loop {
        let (stream, peer) = listener.accept().await?;
        info!(%peer, "New TCP connection");
        let state = Arc::clone(&state);

        // Spawn a task per connection but we expect only one DAW client.
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, peer, state).await {
                error!(%peer, "Connection error: {e}");
            }
            info!(%peer, "Connection closed");
        });
    }
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    state: Arc<AppState>,
) -> Result<()> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    info!(%peer, "WebSocket handshake complete");

    let (mut sink, mut stream) = ws_stream.split();

    while let Some(msg_result) = stream.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                warn!(%peer, "Read error: {e}");
                break;
            }
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
                // Placeholder: echo binary frames back.
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

    Ok(())
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
        } => match state.host.instantiate(&plugin_uid, &instance_id) {
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
        },

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
        } => {
            info!(instance_id, param_id, value, "SetParam (stub)");
            OutgoingMessage::ParamChanged {
                instance_id,
                param_id,
                value,
            }
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
            info!(instance_id, "GetState (stub)");
            OutgoingMessage::StateData {
                instance_id,
                data: base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    b"stub-state-data",
                ),
            }
        }

        IncomingMessage::SetState {
            instance_id,
            data: _,
        } => {
            info!(instance_id, "SetState (stub)");
            OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: "State set (stub)".into(),
            }
        }

        IncomingMessage::LoadPreset {
            instance_id,
            preset_id,
        } => {
            info!(instance_id, preset_id, "LoadPreset (stub)");
            OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: format!("Loaded preset {preset_id} (stub)"),
            }
        }

        IncomingMessage::SetProcessing {
            instance_id,
            active,
        } => {
            info!(instance_id, active, "SetProcessing (stub)");
            OutgoingMessage::Error {
                req_id: None,
                instance_id: Some(instance_id),
                code: "ok".into(),
                message: format!("Processing set to {active} (stub)"),
            }
        }

        IncomingMessage::GetLatency { instance_id } => {
            info!(instance_id, "GetLatency (stub)");
            OutgoingMessage::LatencyInfo {
                instance_id,
                samples: 0,
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

    #[test]
    fn test_handle_message_hello() {
        let state = AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
        };
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
        let state = AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
        };

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
        let state = AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
        };
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

    /// Integration test: start the WS server, connect, send hello, receive hello_ack.
    #[tokio::test]
    async fn test_ws_hello_handshake() {
        // Bind to port 0 to get an ephemeral port.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let state = Arc::new(AppState {
            scanner: PluginScanner::new(),
            host: PluginHost::new(),
        });

        // Spawn the accept loop.
        let server_state = Arc::clone(&state);
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            handle_connection(stream, peer, server_state)
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
            "sample_rate": 48000,
            "block_size": 128
        });
        sink.send(Message::Text(hello.to_string().into()))
            .await
            .unwrap();

        // Receive hello_ack.
        let response = stream.next().await.unwrap().unwrap();
        let text = response.into_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["type"], "hello_ack");
        assert_eq!(parsed["version"], "0.1.0");

        // Clean up.
        sink.send(Message::Close(None)).await.ok();
    }
}

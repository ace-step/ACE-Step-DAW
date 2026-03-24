# ACE-Step Companion

Local companion app that hosts VST3 plugins and communicates with the ACE-Step browser DAW over WebSocket.

## Prerequisites

- Rust 1.75+ (install via [rustup](https://rustup.rs/))

## Build

```bash
cd companion
cargo build
```

## Run

```bash
cargo run
# or with options:
cargo run -- --port 9851 --verbose
```

The server listens on `ws://127.0.0.1:9851` by default.

## Test

```bash
cargo test
```

## CLI Options

| Flag        | Default | Description                  |
|-------------|---------|------------------------------|
| `--port`    | 9851    | WebSocket server port        |
| `--verbose` | off     | Enable debug-level logging   |

## Architecture

```
main.rs              CLI entry point
ws_server.rs         tokio + tungstenite WebSocket server
protocol.rs          Serde structs for the JSON protocol
plugin_scanner.rs    Scans /Library/Audio/Plug-Ins/VST3/ for bundles
plugin_host.rs       Plugin instance lifecycle (stub)
audio_thread.rs      Real-time audio processing (stub)
preset_manager.rs    Preset management (stub)
error.rs             Error types
build.rs             C++ bridge build script (stub)
```

## Protocol

All messages are JSON text frames with a `"type"` discriminant field.

### Browser to Companion

- `hello` — Handshake with sample rate and block size
- `scan_plugins` — Request a plugin scan
- `instantiate` — Load a plugin instance
- `set_param` — Set a parameter value
- `midi` — Send MIDI events to a plugin
- `open_editor` / `close_editor` — Plugin GUI
- `get_state` / `set_state` — Plugin state persistence
- `load_preset` — Load a factory preset
- `destroy` — Unload a plugin instance
- `set_processing` — Enable/disable audio processing
- `get_latency` — Query plugin latency
- `route_sidechain` — Connect sidechain routing

### Companion to Browser

- `hello_ack` — Handshake response with capabilities
- `scan_progress` / `scan_complete` — Plugin scan results
- `instantiated` — Instance created with parameters and presets
- `param_changed` — Parameter value notification
- `editor_opened` / `editor_closed` — GUI state
- `state_data` — Serialized plugin state
- `latency_info` — Latency in samples
- `error` — Error with code and message

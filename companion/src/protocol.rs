//! JSON protocol types for communication between the browser DAW and the companion app.
//!
//! All messages are JSON text frames with a `"type"` discriminant field using snake_case values.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Messages FROM the browser (incoming)
// ---------------------------------------------------------------------------

/// A single MIDI event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MidiEvent {
    /// MIDI status byte (e.g. 0x90 for note-on).
    pub status: u8,
    /// First data byte (e.g. note number).
    pub data1: u8,
    /// Second data byte (e.g. velocity).
    pub data2: u8,
    /// Offset in samples from the start of the current block.
    pub sample_offset: u32,
}

/// Messages sent from the browser to the companion app.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IncomingMessage {
    Hello {
        version: String,
        sample_rate: u32,
        block_size: u32,
    },
    ScanPlugins,
    Instantiate {
        req_id: String,
        plugin_uid: String,
        instance_id: String,
    },
    SetParam {
        instance_id: String,
        param_id: u32,
        value: f64,
    },
    Midi {
        instance_id: String,
        events: Vec<MidiEvent>,
    },
    OpenEditor {
        instance_id: String,
    },
    CloseEditor {
        instance_id: String,
    },
    GetState {
        instance_id: String,
    },
    SetState {
        instance_id: String,
        data: String,
    },
    LoadPreset {
        instance_id: String,
        preset_id: u32,
    },
    Destroy {
        instance_id: String,
    },
    SetProcessing {
        instance_id: String,
        active: bool,
    },
    GetLatency {
        instance_id: String,
    },
    RouteSidechain {
        instance_id: String,
        sidechain_input_bus: u32,
        source_instance_id: String,
    },
}

// ---------------------------------------------------------------------------
// Messages TO the browser (outgoing)
// ---------------------------------------------------------------------------

/// Metadata about a discovered VST3 plugin.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PluginInfo {
    pub uid: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub category: String,
    pub path: String,
}

/// Metadata about a single plugin parameter.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParamInfo {
    pub id: u32,
    pub name: String,
    pub default_value: f64,
    pub min_value: f64,
    pub max_value: f64,
    pub unit: String,
}

/// Metadata about a factory preset.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PresetInfo {
    pub id: u32,
    pub name: String,
}

/// Messages sent from the companion app to the browser.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutgoingMessage {
    HelloAck {
        version: String,
        capabilities: Vec<String>,
    },
    ScanProgress {
        found: u32,
        current: String,
    },
    ScanComplete {
        plugins: Vec<PluginInfo>,
    },
    Instantiated {
        req_id: String,
        instance_id: String,
        parameters: Vec<ParamInfo>,
        latency_samples: u32,
        tail_samples: u32,
        presets: Vec<PresetInfo>,
    },
    ParamChanged {
        instance_id: String,
        param_id: u32,
        value: f64,
    },
    EditorOpened {
        instance_id: String,
        width: u32,
        height: u32,
    },
    EditorClosed {
        instance_id: String,
    },
    StateData {
        instance_id: String,
        data: String,
    },
    LatencyInfo {
        instance_id: String,
        samples: u32,
    },
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        req_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        instance_id: Option<String>,
        code: String,
        message: String,
    },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incoming_hello_roundtrip() {
        let msg = IncomingMessage::Hello {
            version: "1.0".into(),
            sample_rate: 48000,
            block_size: 128,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
        // Verify the type discriminant
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(val["type"], "hello");
    }

    #[test]
    fn test_incoming_scan_plugins_roundtrip() {
        let msg = IncomingMessage::ScanPlugins;
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(val["type"], "scan_plugins");
    }

    #[test]
    fn test_incoming_instantiate_roundtrip() {
        let msg = IncomingMessage::Instantiate {
            req_id: "r1".into(),
            plugin_uid: "uid-abc".into(),
            instance_id: "inst-1".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_set_param_roundtrip() {
        let msg = IncomingMessage::SetParam {
            instance_id: "inst-1".into(),
            param_id: 42,
            value: 0.75,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_midi_roundtrip() {
        let msg = IncomingMessage::Midi {
            instance_id: "inst-1".into(),
            events: vec![MidiEvent {
                status: 0x90,
                data1: 60,
                data2: 100,
                sample_offset: 0,
            }],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_destroy_roundtrip() {
        let msg = IncomingMessage::Destroy {
            instance_id: "inst-1".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_set_processing_roundtrip() {
        let msg = IncomingMessage::SetProcessing {
            instance_id: "inst-1".into(),
            active: true,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_get_latency_roundtrip() {
        let msg = IncomingMessage::GetLatency {
            instance_id: "inst-1".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_incoming_route_sidechain_roundtrip() {
        let msg = IncomingMessage::RouteSidechain {
            instance_id: "inst-1".into(),
            sidechain_input_bus: 1,
            source_instance_id: "inst-2".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: IncomingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_outgoing_hello_ack_roundtrip() {
        let msg = OutgoingMessage::HelloAck {
            version: "0.1.0".into(),
            capabilities: vec!["scan".into(), "host".into()],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(val["type"], "hello_ack");
    }

    #[test]
    fn test_outgoing_scan_complete_roundtrip() {
        let msg = OutgoingMessage::ScanComplete {
            plugins: vec![PluginInfo {
                uid: "uid-1".into(),
                name: "TestSynth".into(),
                vendor: "TestVendor".into(),
                version: "1.0.0".into(),
                category: "Instrument".into(),
                path: "/Library/Audio/Plug-Ins/VST3/TestSynth.vst3".into(),
            }],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_outgoing_instantiated_roundtrip() {
        let msg = OutgoingMessage::Instantiated {
            req_id: "r1".into(),
            instance_id: "inst-1".into(),
            parameters: vec![ParamInfo {
                id: 0,
                name: "Volume".into(),
                default_value: 0.8,
                min_value: 0.0,
                max_value: 1.0,
                unit: "dB".into(),
            }],
            latency_samples: 0,
            tail_samples: 0,
            presets: vec![PresetInfo {
                id: 0,
                name: "Default".into(),
            }],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_outgoing_error_roundtrip() {
        let msg = OutgoingMessage::Error {
            req_id: Some("r1".into()),
            instance_id: None,
            code: "not_found".into(),
            message: "Plugin not found".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
        // Verify optional fields are properly skipped
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(val.get("instance_id").is_none());
    }

    #[test]
    fn test_outgoing_error_with_all_fields() {
        let msg = OutgoingMessage::Error {
            req_id: Some("r1".into()),
            instance_id: Some("inst-1".into()),
            code: "host_error".into(),
            message: "Failed to process".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(val["instance_id"], "inst-1");
    }

    #[test]
    fn test_parse_hello_from_raw_json() {
        let raw = r#"{"type":"hello","version":"1.0","sample_rate":44100,"block_size":256}"#;
        let msg: IncomingMessage = serde_json::from_str(raw).unwrap();
        assert_eq!(
            msg,
            IncomingMessage::Hello {
                version: "1.0".into(),
                sample_rate: 44100,
                block_size: 256,
            }
        );
    }

    #[test]
    fn test_parse_scan_plugins_from_raw_json() {
        let raw = r#"{"type":"scan_plugins"}"#;
        let msg: IncomingMessage = serde_json::from_str(raw).unwrap();
        assert_eq!(msg, IncomingMessage::ScanPlugins);
    }

    #[test]
    fn test_outgoing_scan_progress_roundtrip() {
        let msg = OutgoingMessage::ScanProgress {
            found: 5,
            current: "/Library/Audio/Plug-Ins/VST3/Diva.vst3".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }

    #[test]
    fn test_outgoing_latency_info_roundtrip() {
        let msg = OutgoingMessage::LatencyInfo {
            instance_id: "inst-1".into(),
            samples: 512,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: OutgoingMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, parsed);
    }
}

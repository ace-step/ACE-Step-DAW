//! VST3 host interface implementations.
//!
//! These COM classes are passed to VST3 plugins so they can communicate back
//! to the host (parameter changes, state persistence, etc.).

use std::cell::RefCell;
use std::ptr;
use std::sync::Arc;

use crossbeam::queue::SegQueue;
use vst3::com_scrape_types::Guid;
use vst3::{Class, ComWrapper};
use vst3::Steinberg::{
    IBStream, IBStreamTrait, FUnknown, IPluginBase,
    kResultOk, kResultFalse, kInvalidArgument, tresult, int32, int64,
    TUID, char16,
};
use vst3::Steinberg::Vst::{
    IComponentHandler, IComponentHandlerTrait, IHostApplication, IHostApplicationTrait,
    IEventList, IEventListTrait,
    Event, Event__type0, Event_::EventTypes_,
    NoteOnEvent, NoteOffEvent,
    String128, ParamID, ParamValue,
};

// ---------------------------------------------------------------------------
// Parameter change notification
// ---------------------------------------------------------------------------

/// A parameter change reported by the plugin (e.g. from its GUI).
#[derive(Debug, Clone)]
pub struct HostParamChange {
    pub instance_id: String,
    pub param_id: u32,
    pub value: f64,
}

/// Shared collector that aggregates parameter changes from all plugin instances.
///
/// Passed to each `AceComponentHandler` via `Arc` so changes from any instance
/// end up in a single queue that the WebSocket server can drain.
#[derive(Clone)]
pub struct ParamChangeCollector {
    queue: Arc<SegQueue<HostParamChange>>,
}

impl ParamChangeCollector {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(SegQueue::new()),
        }
    }

    /// Push a change into the queue (used by `AceComponentHandler` and tests).
    pub fn push(&self, change: HostParamChange) {
        self.queue.push(change);
    }

    /// Drain all pending changes, returning them as a `Vec`.
    pub fn drain(&self) -> Vec<HostParamChange> {
        let mut changes = Vec::new();
        while let Some(change) = self.queue.pop() {
            changes.push(change);
        }
        changes
    }

    /// Get a reference to the inner queue `Arc` (for passing to `AceComponentHandler`).
    pub(crate) fn queue_arc(&self) -> &Arc<SegQueue<HostParamChange>> {
        &self.queue
    }
}

/// Implements `IComponentHandler` — receives parameter edit notifications from plugins.
///
/// Changes are pushed to a shared lock-free queue for the WebSocket thread to consume.
pub struct AceComponentHandler {
    instance_id: String,
    collector: Arc<SegQueue<HostParamChange>>,
    /// Local queue for testing — populated when no collector is provided.
    pub changes: SegQueue<HostParamChange>,
}

impl AceComponentHandler {
    /// Create a handler for testing (changes go to the local `changes` queue).
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id: String::new(),
            collector: Arc::new(SegQueue::new()),
            changes: SegQueue::new(),
        })
    }

    /// Create a handler wired to a shared collector.
    pub fn with_collector(instance_id: String, collector: &ParamChangeCollector) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id,
            collector: Arc::clone(collector.queue_arc()),
            changes: SegQueue::new(),
        })
    }
}

impl Class for AceComponentHandler {
    type Interfaces = (IComponentHandler,);
}

impl IComponentHandlerTrait for AceComponentHandler {
    unsafe fn beginEdit(&self, _id: ParamID) -> tresult {
        kResultOk
    }

    unsafe fn performEdit(&self, id: ParamID, valueNormalized: ParamValue) -> tresult {
        let change = HostParamChange {
            instance_id: self.instance_id.clone(),
            param_id: id,
            value: valueNormalized,
        };
        // Push to shared collector for WebSocket forwarding
        self.collector.push(change.clone());
        // Also push to local queue (useful for tests)
        self.changes.push(change);
        kResultOk
    }

    unsafe fn endEdit(&self, _id: ParamID) -> tresult {
        kResultOk
    }

    unsafe fn restartComponent(&self, _flags: int32) -> tresult {
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// Host application identity
// ---------------------------------------------------------------------------

/// Implements `IHostApplication` — provides host name to plugins.
pub struct AceHostApplication;

impl AceHostApplication {
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self)
    }
}

impl Class for AceHostApplication {
    type Interfaces = (IHostApplication,);
}

impl IHostApplicationTrait for AceHostApplication {
    unsafe fn getName(&self, name: *mut String128) -> tresult {
        if name.is_null() {
            return kInvalidArgument;
        }
        let host_name = "ACE-Step DAW";
        let name_ref = &mut *name;
        for (i, ch) in host_name.encode_utf16().enumerate() {
            if i >= 127 { break; }
            name_ref[i] = ch;
        }
        // Null-terminate
        let len = host_name.encode_utf16().count().min(127);
        name_ref[len] = 0;
        kResultOk
    }

    unsafe fn createInstance(
        &self,
        _cid: *mut TUID,
        _iid: *mut TUID,
        obj: *mut *mut std::ffi::c_void,
    ) -> tresult {
        if !obj.is_null() {
            *obj = ptr::null_mut();
        }
        kResultFalse // We don't create sub-objects
    }
}

// ---------------------------------------------------------------------------
// Binary stream for state persistence
// ---------------------------------------------------------------------------

/// Implements `IBStream` — a simple in-memory byte buffer for state save/load.
pub struct MemoryStream {
    data: RefCell<Vec<u8>>,
    pos: RefCell<i64>,
}

impl MemoryStream {
    /// Create an empty stream (for writing/saving state).
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            data: RefCell::new(Vec::new()),
            pos: RefCell::new(0),
        })
    }

    /// Create a stream pre-filled with data (for reading/loading state).
    pub fn from_data(data: Vec<u8>) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            data: RefCell::new(data),
            pos: RefCell::new(0),
        })
    }

    /// Get the accumulated data (after a write/save operation).
    pub fn into_data(&self) -> Vec<u8> {
        self.data.borrow().clone()
    }
}

impl Class for MemoryStream {
    type Interfaces = (IBStream,);
}

impl IBStreamTrait for MemoryStream {
    unsafe fn read(
        &self,
        buffer: *mut std::ffi::c_void,
        numBytes: int32,
        numBytesRead: *mut int32,
    ) -> tresult {
        let data = self.data.borrow();
        let pos = *self.pos.borrow() as usize;
        let available = data.len().saturating_sub(pos);
        let to_read = (numBytes as usize).min(available);

        if to_read > 0 && !buffer.is_null() {
            ptr::copy_nonoverlapping(
                data[pos..].as_ptr(),
                buffer as *mut u8,
                to_read,
            );
        }

        *self.pos.borrow_mut() += to_read as i64;

        if !numBytesRead.is_null() {
            *numBytesRead = to_read as int32;
        }

        kResultOk
    }

    unsafe fn write(
        &self,
        buffer: *mut std::ffi::c_void,
        numBytes: int32,
        numBytesWritten: *mut int32,
    ) -> tresult {
        if buffer.is_null() || numBytes <= 0 {
            if !numBytesWritten.is_null() {
                *numBytesWritten = 0;
            }
            return kResultOk;
        }

        let bytes = std::slice::from_raw_parts(buffer as *const u8, numBytes as usize);
        let mut data = self.data.borrow_mut();
        let pos = *self.pos.borrow() as usize;

        // Extend data if writing past the end
        if pos + bytes.len() > data.len() {
            data.resize(pos + bytes.len(), 0);
        }
        data[pos..pos + bytes.len()].copy_from_slice(bytes);

        *self.pos.borrow_mut() += bytes.len() as i64;

        if !numBytesWritten.is_null() {
            *numBytesWritten = bytes.len() as int32;
        }

        kResultOk
    }

    unsafe fn seek(&self, pos: int64, mode: int32, result: *mut int64) -> tresult {
        let data = self.data.borrow();
        let new_pos = match mode {
            0 => pos,                                    // kIBSeekSet
            1 => *self.pos.borrow() + pos,              // kIBSeekCur
            2 => data.len() as i64 + pos,               // kIBSeekEnd
            _ => return kInvalidArgument,
        };

        if new_pos < 0 {
            return kInvalidArgument;
        }

        *self.pos.borrow_mut() = new_pos;

        if !result.is_null() {
            *result = new_pos;
        }

        kResultOk
    }

    unsafe fn tell(&self, pos: *mut int64) -> tresult {
        if !pos.is_null() {
            *pos = *self.pos.borrow();
        }
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// IEventList implementation for MIDI events
// ---------------------------------------------------------------------------

/// Implements `IEventList` — a simple in-memory list of VST3 events.
///
/// Used to pass MIDI note-on/off events into `IAudioProcessor::process()`.
pub struct EventList {
    events: RefCell<Vec<Event>>,
}

impl EventList {
    /// Create an empty event list.
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            events: RefCell::new(Vec::new()),
        })
    }

    /// Create an event list pre-populated with events.
    pub fn with_events(events: Vec<Event>) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            events: RefCell::new(events),
        })
    }
}

impl Class for EventList {
    type Interfaces = (IEventList,);
}

impl IEventListTrait for EventList {
    unsafe fn getEventCount(&self) -> int32 {
        self.events.borrow().len() as int32
    }

    unsafe fn getEvent(&self, index: int32, e: *mut Event) -> tresult {
        let events = self.events.borrow();
        if index < 0 || (index as usize) >= events.len() || e.is_null() {
            return kInvalidArgument;
        }
        *e = events[index as usize];
        kResultOk
    }

    unsafe fn addEvent(&self, e: *mut Event) -> tresult {
        if e.is_null() {
            return kInvalidArgument;
        }
        self.events.borrow_mut().push(*e);
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// MIDI-to-VST3 Event conversion
// ---------------------------------------------------------------------------

use crate::audio_thread::MidiEvent;

/// Convert a raw MIDI event (status/data1/data2) into a VST3 `Event`.
///
/// Supports note-on (0x90) and note-off (0x80) messages.
/// Returns `None` for unsupported message types.
pub fn midi_to_vst3_event(midi: &MidiEvent) -> Option<Event> {
    let message_type = midi.status & 0xF0;
    let channel = (midi.status & 0x0F) as i16;

    match message_type {
        0x90 => {
            // Note-on with velocity 0 is treated as note-off per MIDI spec
            if midi.data2 == 0 {
                Some(make_note_off_event(
                    channel,
                    midi.data1 as i16,
                    0.0,
                    midi.sample_offset as i32,
                ))
            } else {
                Some(make_note_on_event(
                    channel,
                    midi.data1 as i16,
                    midi.data2 as f32 / 127.0,
                    midi.sample_offset as i32,
                ))
            }
        }
        0x80 => Some(make_note_off_event(
            channel,
            midi.data1 as i16,
            midi.data2 as f32 / 127.0,
            midi.sample_offset as i32,
        )),
        _ => None, // Unsupported message type
    }
}

fn make_note_on_event(channel: i16, pitch: i16, velocity: f32, sample_offset: i32) -> Event {
    Event {
        busIndex: 0,
        sampleOffset: sample_offset,
        ppqPosition: 0.0,
        flags: 0,
        r#type: EventTypes_::kNoteOnEvent as u16,
        __field0: Event__type0 {
            noteOn: NoteOnEvent {
                channel,
                pitch,
                tuning: 0.0,
                velocity,
                length: 0, // not specified
                noteId: -1, // unassigned
            },
        },
    }
}

fn make_note_off_event(channel: i16, pitch: i16, velocity: f32, sample_offset: i32) -> Event {
    Event {
        busIndex: 0,
        sampleOffset: sample_offset,
        ppqPosition: 0.0,
        flags: 0,
        r#type: EventTypes_::kNoteOffEvent as u16,
        __field0: Event__type0 {
            noteOff: NoteOffEvent {
                channel,
                pitch,
                velocity,
                noteId: -1,
                tuning: 0.0,
            },
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_handler_captures_param_changes() {
        let handler = AceComponentHandler::new();
        unsafe {
            handler.performEdit(42, 0.75);
            handler.performEdit(7, 0.5);
        }
        let c1 = handler.changes.pop().unwrap();
        assert_eq!(c1.param_id, 42);
        assert!((c1.value - 0.75).abs() < f64::EPSILON);

        let c2 = handler.changes.pop().unwrap();
        assert_eq!(c2.param_id, 7);
    }

    #[test]
    fn collector_aggregates_changes_from_multiple_handlers() {
        let collector = ParamChangeCollector::new();

        let h1 = AceComponentHandler::with_collector("inst-1".into(), &collector);
        let h2 = AceComponentHandler::with_collector("inst-2".into(), &collector);

        unsafe {
            h1.performEdit(1, 0.5);
            h2.performEdit(2, 0.75);
            h1.performEdit(3, 1.0);
        }

        let changes = collector.drain();
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].instance_id, "inst-1");
        assert_eq!(changes[0].param_id, 1);
        assert_eq!(changes[1].instance_id, "inst-2");
        assert_eq!(changes[1].param_id, 2);
        assert_eq!(changes[2].instance_id, "inst-1");
        assert_eq!(changes[2].param_id, 3);

        // Queue should be empty after drain
        assert!(collector.drain().is_empty());
    }

    #[test]
    fn host_application_returns_name() {
        let host = AceHostApplication::new();
        let mut name: String128 = [0u16; 128];
        unsafe {
            let result = host.getName(&mut name);
            assert_eq!(result, kResultOk);
        }
        let s: String = name.iter()
            .take_while(|&&c| c != 0)
            .map(|&c| char::from(c as u8))
            .collect();
        assert_eq!(s, "ACE-Step DAW");
    }

    #[test]
    fn memory_stream_write_then_read() {
        let stream = MemoryStream::new();
        let write_data = b"Hello VST3";

        unsafe {
            let mut written: int32 = 0;
            stream.write(
                write_data.as_ptr() as *mut std::ffi::c_void,
                write_data.len() as int32,
                &mut written,
            );
            assert_eq!(written, write_data.len() as int32);

            // Seek back to start
            stream.seek(0, 0, ptr::null_mut());

            // Read back
            let mut buf = [0u8; 32];
            let mut read_count: int32 = 0;
            stream.read(
                buf.as_mut_ptr() as *mut std::ffi::c_void,
                32,
                &mut read_count,
            );
            assert_eq!(read_count, write_data.len() as int32);
            assert_eq!(&buf[..write_data.len()], write_data);
        }
    }

    #[test]
    fn memory_stream_from_data() {
        let data = vec![1, 2, 3, 4, 5];
        let stream = MemoryStream::from_data(data.clone());

        unsafe {
            let mut buf = [0u8; 5];
            let mut read_count: int32 = 0;
            stream.read(
                buf.as_mut_ptr() as *mut std::ffi::c_void,
                5,
                &mut read_count,
            );
            assert_eq!(read_count, 5);
            assert_eq!(&buf, &[1, 2, 3, 4, 5]);
        }

        let result = stream.into_data();
        assert_eq!(result, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn memory_stream_seek_modes() {
        let stream = MemoryStream::from_data(vec![0; 100]);

        unsafe {
            let mut pos: int64 = 0;

            // Seek from start
            stream.seek(50, 0, &mut pos);
            assert_eq!(pos, 50);

            // Seek from current (+10)
            stream.seek(10, 1, &mut pos);
            assert_eq!(pos, 60);

            // Seek from end (-20)
            stream.seek(-20, 2, &mut pos);
            assert_eq!(pos, 80);

            // Tell
            stream.tell(&mut pos);
            assert_eq!(pos, 80);
        }
    }

    // =========================================================================
    // EventList tests
    // =========================================================================

    #[test]
    fn event_list_empty_has_zero_count() {
        let list = EventList::new();
        unsafe {
            assert_eq!(list.getEventCount(), 0);
        }
    }

    #[test]
    fn event_list_add_and_get_events() {
        let list = EventList::new();
        let mut event = make_note_on_event(0, 60, 0.8, 0);

        unsafe {
            let result = list.addEvent(&mut event);
            assert_eq!(result, kResultOk);
            assert_eq!(list.getEventCount(), 1);

            let mut retrieved: Event = std::mem::zeroed();
            let result = list.getEvent(0, &mut retrieved);
            assert_eq!(result, kResultOk);
            assert_eq!(retrieved.r#type, EventTypes_::kNoteOnEvent as u16);
            assert_eq!(retrieved.__field0.noteOn.pitch, 60);
        }
    }

    #[test]
    fn event_list_get_event_out_of_bounds() {
        let list = EventList::new();
        unsafe {
            let mut event: Event = std::mem::zeroed();
            let result = list.getEvent(0, &mut event);
            assert_eq!(result, kInvalidArgument);
            let result = list.getEvent(-1, &mut event);
            assert_eq!(result, kInvalidArgument);
        }
    }

    #[test]
    fn event_list_with_events() {
        let events = vec![
            make_note_on_event(0, 60, 1.0, 0),
            make_note_off_event(0, 60, 0.0, 100),
        ];
        let list = EventList::with_events(events);
        unsafe {
            assert_eq!(list.getEventCount(), 2);

            let mut e: Event = std::mem::zeroed();
            list.getEvent(0, &mut e);
            assert_eq!(e.r#type, EventTypes_::kNoteOnEvent as u16);

            list.getEvent(1, &mut e);
            assert_eq!(e.r#type, EventTypes_::kNoteOffEvent as u16);
        }
    }

    // =========================================================================
    // MIDI-to-VST3 conversion tests
    // =========================================================================

    #[test]
    fn midi_note_on_converts_correctly() {
        let midi = MidiEvent {
            status: 0x90,
            data1: 60,
            data2: 100,
            sample_offset: 42,
        };
        let event = midi_to_vst3_event(&midi).unwrap();
        assert_eq!(event.r#type, EventTypes_::kNoteOnEvent as u16);
        assert_eq!(event.sampleOffset, 42);
        unsafe {
            assert_eq!(event.__field0.noteOn.channel, 0);
            assert_eq!(event.__field0.noteOn.pitch, 60);
            assert!((event.__field0.noteOn.velocity - 100.0 / 127.0).abs() < 0.01);
        }
    }

    #[test]
    fn midi_note_off_converts_correctly() {
        let midi = MidiEvent {
            status: 0x80,
            data1: 64,
            data2: 0,
            sample_offset: 10,
        };
        let event = midi_to_vst3_event(&midi).unwrap();
        assert_eq!(event.r#type, EventTypes_::kNoteOffEvent as u16);
        assert_eq!(event.sampleOffset, 10);
        unsafe {
            assert_eq!(event.__field0.noteOff.channel, 0);
            assert_eq!(event.__field0.noteOff.pitch, 64);
        }
    }

    #[test]
    fn midi_note_on_velocity_zero_is_note_off() {
        let midi = MidiEvent {
            status: 0x90,
            data1: 60,
            data2: 0,
            sample_offset: 0,
        };
        let event = midi_to_vst3_event(&midi).unwrap();
        assert_eq!(event.r#type, EventTypes_::kNoteOffEvent as u16);
    }

    #[test]
    fn midi_channel_extracted_from_status() {
        let midi = MidiEvent {
            status: 0x95, // note-on, channel 5
            data1: 72,
            data2: 80,
            sample_offset: 0,
        };
        let event = midi_to_vst3_event(&midi).unwrap();
        unsafe {
            assert_eq!(event.__field0.noteOn.channel, 5);
        }
    }

    #[test]
    fn midi_unsupported_type_returns_none() {
        // Control change (0xB0) is not supported yet
        let midi = MidiEvent {
            status: 0xB0,
            data1: 1,
            data2: 64,
            sample_offset: 0,
        };
        assert!(midi_to_vst3_event(&midi).is_none());
    }
}

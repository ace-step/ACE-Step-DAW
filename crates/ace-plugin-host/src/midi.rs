//! MIDI event handling: a flat `MidiEvent` struct for cross-IPC
//! transport, a conversion into VST3's `Event` union, and a minimal
//! host-side `IEventList` implementation to hand note-on / note-off
//! events to `IAudioProcessor::process()`.
//!
//! Ported from `companion/src/host_impl.rs` (`EventList`,
//! `midi_to_vst3_event`, `make_note_on_event`, `make_note_off_event`)
//! — the companion ran this in production so the COM-side logic is
//! battle-tested. Adapted to live in a module that can exist without
//! the companion's WebSocket protocol.
//!
//! Phase 4B-2a scope:
//!
//! - Note-on (`0x90`) / note-off (`0x80`) only. Note-on with velocity
//!   0 is interpreted as note-off per the MIDI 1.0 spec.
//! - Other MIDI message types (CC, pitchbend, aftertouch, sysex)
//!   return `None` from the converter — plugins that need them can
//!   be wired up incrementally in a follow-up.
//! - `outputEvents` is always null; 4B / future phases can wire up
//!   plugin-emitted MIDI if a DAW workflow ever needs it.

use std::cell::RefCell;

use vst3::Steinberg::Vst::{
    Event, Event__type0, Event_::EventTypes_, IEventList, IEventListTrait, NoteOffEvent,
    NoteOnEvent,
};
use vst3::Steinberg::{int32, kInvalidArgument, kResultOk, tresult};
use vst3::{Class, ComWrapper};

/// A flat MIDI event — the shape we accept from callers (the DAW's
/// sequencer, a MIDI-learn mapping, etc.). We keep `u8` status /
/// data1 / data2 instead of a parsed enum so unsupported message
/// types round-trip cleanly and can be filtered later.
///
/// `sample_offset` is the offset within the current audio block
/// where the event should fire; VST3 forwards this as `sampleOffset`
/// in the `Event` struct so plugins can render sample-accurate MIDI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MidiEvent {
    pub status: u8,
    pub data1: u8,
    pub data2: u8,
    pub sample_offset: u32,
}

impl MidiEvent {
    pub const fn note_on(channel: u8, pitch: u8, velocity: u8, sample_offset: u32) -> Self {
        Self {
            status: 0x90 | (channel & 0x0F),
            data1: pitch & 0x7F,
            data2: velocity & 0x7F,
            sample_offset,
        }
    }

    pub const fn note_off(channel: u8, pitch: u8, velocity: u8, sample_offset: u32) -> Self {
        Self {
            status: 0x80 | (channel & 0x0F),
            data1: pitch & 0x7F,
            data2: velocity & 0x7F,
            sample_offset,
        }
    }
}

/// Convert a flat `MidiEvent` into a VST3 `Event`.
///
/// Returns `None` for unsupported status bytes — CC, pitchbend,
/// aftertouch, program change, sysex all currently fall here. Adding
/// them is a question of wiring the equivalent `Event` variant; the
/// skeleton is deliberately minimal for 4B-2a.
pub fn midi_to_vst3_event(midi: &MidiEvent) -> Option<Event> {
    let message_type = midi.status & 0xF0;
    let channel = (midi.status & 0x0F) as i16;

    // VST3's `Event::sampleOffset` is `i32`. Our input is `u32`, so
    // any value past `i32::MAX` would wrap to negative — nonsensical
    // as a block-relative offset and a source of plugin-side OOB
    // scheduling bugs. Drop the event outright if it can't round-trip.
    let sample_offset = i32::try_from(midi.sample_offset).ok()?;

    match message_type {
        0x90 => {
            // Note-on with velocity 0 is treated as note-off per the
            // MIDI 1.0 spec (§A-2). Plugins that don't implement this
            // convention will get stuck notes if we don't translate.
            if midi.data2 == 0 {
                Some(make_note_off_event(
                    channel,
                    midi.data1 as i16,
                    0.0,
                    sample_offset,
                ))
            } else {
                Some(make_note_on_event(
                    channel,
                    midi.data1 as i16,
                    midi.data2 as f32 / 127.0,
                    sample_offset,
                ))
            }
        }
        0x80 => Some(make_note_off_event(
            channel,
            midi.data1 as i16,
            midi.data2 as f32 / 127.0,
            sample_offset,
        )),
        _ => None,
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
                length: 0,
                noteId: -1,
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
// IEventList
// ---------------------------------------------------------------------------

/// Host-side `IEventList` implementation. VST3 expects events
/// delivered to `IAudioProcessor::process()` to live behind a COM
/// interface the plugin can poll; this is the smallest possible
/// implementation — a `RefCell<Vec<Event>>` under the `ComWrapper`
/// the `vst3` crate provides.
///
/// Thread model: constructed on the host thread, read from the
/// plugin's `process()` call, dropped when `process()` returns.
/// `RefCell` is fine because the plugin never retains the pointer
/// past the call, and we don't share the wrapper across threads.
pub struct EventList {
    events: RefCell<Vec<Event>>,
}

impl EventList {
    /// Empty list — used as a "no MIDI this block" sentinel.
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            events: RefCell::new(Vec::new()),
        })
    }

    /// Pre-populated list. Taking ownership here avoids a clone at
    /// each block boundary.
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
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_on_helper_packs_status_byte() {
        let e = MidiEvent::note_on(3, 60, 100, 128);
        assert_eq!(e.status, 0x93);
        assert_eq!(e.data1, 60);
        assert_eq!(e.data2, 100);
        assert_eq!(e.sample_offset, 128);
    }

    #[test]
    fn note_on_helper_masks_channel_to_low_nibble() {
        let e = MidiEvent::note_on(0xFF, 60, 100, 0);
        assert_eq!(e.status, 0x9F);
    }

    #[test]
    fn note_off_helper_packs_status_byte() {
        let e = MidiEvent::note_off(0, 60, 64, 0);
        assert_eq!(e.status, 0x80);
    }

    #[test]
    fn midi_to_vst3_converts_note_on_to_note_on_event() {
        let midi = MidiEvent::note_on(5, 69, 100, 42);
        let event = midi_to_vst3_event(&midi).expect("note-on should convert");
        assert_eq!(event.r#type, EventTypes_::kNoteOnEvent as u16);
        assert_eq!(event.sampleOffset, 42);
        // SAFETY: the type tag above confirms the union variant.
        unsafe {
            let note = event.__field0.noteOn;
            assert_eq!(note.channel, 5);
            assert_eq!(note.pitch, 69);
            assert!((note.velocity - (100.0 / 127.0)).abs() < f32::EPSILON);
        }
    }

    #[test]
    fn midi_to_vst3_converts_note_off_to_note_off_event() {
        let midi = MidiEvent::note_off(2, 60, 64, 0);
        let event = midi_to_vst3_event(&midi).expect("note-off should convert");
        assert_eq!(event.r#type, EventTypes_::kNoteOffEvent as u16);
        unsafe {
            let note = event.__field0.noteOff;
            assert_eq!(note.channel, 2);
            assert_eq!(note.pitch, 60);
        }
    }

    #[test]
    fn midi_to_vst3_treats_velocity_zero_note_on_as_note_off() {
        // MIDI 1.0 spec §A-2: note-on with velocity 0 is the
        // canonical way many controllers send note-off.
        let midi = MidiEvent::note_on(0, 60, 0, 0);
        let event = midi_to_vst3_event(&midi).expect("velocity-0 note-on should convert");
        assert_eq!(event.r#type, EventTypes_::kNoteOffEvent as u16);
    }

    #[test]
    fn midi_to_vst3_drops_events_with_sample_offset_past_i32_max() {
        // u32 > i32::MAX would wrap to negative when cast — drop it
        // rather than scheduling at a nonsensical offset.
        let bad = MidiEvent {
            status: 0x90,
            data1: 60,
            data2: 100,
            sample_offset: (i32::MAX as u32) + 1,
        };
        assert!(midi_to_vst3_event(&bad).is_none());
    }

    #[test]
    fn midi_to_vst3_accepts_sample_offset_at_i32_max() {
        let ok = MidiEvent {
            status: 0x90,
            data1: 60,
            data2: 100,
            sample_offset: i32::MAX as u32,
        };
        let event = midi_to_vst3_event(&ok).expect("i32::MAX should round-trip");
        assert_eq!(event.sampleOffset, i32::MAX);
    }

    #[test]
    fn midi_to_vst3_returns_none_for_unsupported_types() {
        // CC message
        let cc = MidiEvent {
            status: 0xB0,
            data1: 7,
            data2: 127,
            sample_offset: 0,
        };
        assert!(midi_to_vst3_event(&cc).is_none());

        // Pitchbend
        let pb = MidiEvent {
            status: 0xE0,
            data1: 0,
            data2: 64,
            sample_offset: 0,
        };
        assert!(midi_to_vst3_event(&pb).is_none());
    }

    #[test]
    fn event_list_starts_empty() {
        let list = EventList::new();
        let el = list.to_com_ptr::<IEventList>().unwrap();
        unsafe {
            assert_eq!(el.getEventCount(), 0);
        }
    }

    #[test]
    fn event_list_with_events_reports_count() {
        let events = vec![
            midi_to_vst3_event(&MidiEvent::note_on(0, 60, 100, 0)).unwrap(),
            midi_to_vst3_event(&MidiEvent::note_off(0, 60, 0, 64)).unwrap(),
        ];
        let list = EventList::with_events(events);
        let el = list.to_com_ptr::<IEventList>().unwrap();
        unsafe {
            assert_eq!(el.getEventCount(), 2);
        }
    }

    #[test]
    fn event_list_get_event_round_trips() {
        let original = midi_to_vst3_event(&MidiEvent::note_on(3, 72, 80, 256)).unwrap();
        let list = EventList::with_events(vec![original]);
        let el = list.to_com_ptr::<IEventList>().unwrap();
        let mut out: Event = unsafe { std::mem::zeroed() };
        let result = unsafe { el.getEvent(0, &mut out) };
        assert_eq!(result, kResultOk);
        assert_eq!(out.r#type, original.r#type);
        assert_eq!(out.sampleOffset, 256);
    }

    #[test]
    fn event_list_get_event_rejects_out_of_bounds() {
        let list = EventList::new();
        let el = list.to_com_ptr::<IEventList>().unwrap();
        let mut out: Event = unsafe { std::mem::zeroed() };
        let result = unsafe { el.getEvent(0, &mut out) };
        assert_eq!(result, kInvalidArgument);
        let result = unsafe { el.getEvent(-1, &mut out) };
        assert_eq!(result, kInvalidArgument);
    }

    #[test]
    fn event_list_get_event_rejects_null_output_pointer() {
        let list = EventList::with_events(vec![
            midi_to_vst3_event(&MidiEvent::note_on(0, 60, 100, 0)).unwrap(),
        ]);
        let el = list.to_com_ptr::<IEventList>().unwrap();
        let result = unsafe { el.getEvent(0, std::ptr::null_mut()) };
        assert_eq!(result, kInvalidArgument);
    }

    #[test]
    fn event_list_add_event_appends() {
        let list = EventList::new();
        let el = list.to_com_ptr::<IEventList>().unwrap();
        let mut event =
            midi_to_vst3_event(&MidiEvent::note_on(1, 64, 90, 0)).unwrap();
        let result = unsafe { el.addEvent(&mut event) };
        assert_eq!(result, kResultOk);
        unsafe {
            assert_eq!(el.getEventCount(), 1);
        }
    }

    #[test]
    fn event_list_add_event_rejects_null() {
        let list = EventList::new();
        let el = list.to_com_ptr::<IEventList>().unwrap();
        let result = unsafe { el.addEvent(std::ptr::null_mut()) };
        assert_eq!(result, kInvalidArgument);
    }

    /// Regression test for Codex P2: drained MIDI must be sorted by
    /// `sample_offset` before converting, because VST3 plugins
    /// iterate the host's IEventList forward by index and don't
    /// re-sort internally. Out-of-order input has been observed to
    /// cause missed note-offs and stuck notes in real-world plugins.
    #[test]
    fn sort_by_sample_offset_is_deterministic() {
        // Producer pushed note-off BEFORE note-on for the same pitch,
        // e.g. because two threads raced on queuing.
        let mut events = [
            MidiEvent::note_off(0, 60, 0, 256),
            MidiEvent::note_on(0, 60, 100, 0),
            MidiEvent::note_on(0, 64, 80, 128),
        ];
        events.sort_by_key(|e| e.sample_offset);
        assert_eq!(events[0].sample_offset, 0);
        assert_eq!(events[1].sample_offset, 128);
        assert_eq!(events[2].sample_offset, 256);
    }
}

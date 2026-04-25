//! Host-side `IBStream` for VST3 state persistence (Phase 4C-1).
//!
//! `MemoryStream` is a simple in-memory byte buffer that implements
//! Steinberg's `IBStream` interface. Plugins use it to serialise
//! their state (`IComponent::getState`) and restore from it
//! (`IComponent::setState`). The DAW-level workflow is:
//!
//! 1. Create an empty `MemoryStream`.
//! 2. Hand its `IBStream` pointer to `getState()`; the plugin writes
//!    its state into the stream.
//! 3. Read the accumulated bytes out via `into_data()` and stash them
//!    in the project file.
//!
//! Loading is the mirror: create a stream pre-populated with the
//! saved blob, hand its pointer to `setState()`, and the plugin
//! restores itself from our byte array.
//!
//! Ported from `companion/src/host_impl.rs:186-308`. The companion
//! ran this in production for preset save/load over WebSocket; the
//! port is mechanical except that the module now lives on its own
//! so the audio / lifecycle modules don't have to depend on the
//! host-app identity types.

use std::cell::RefCell;
use std::ptr;

use vst3::Steinberg::{
    int32, int64, kInvalidArgument, kResultOk, tresult, IBStream, IBStreamTrait,
};
use vst3::{Class, ComWrapper};

/// VST3 `IBStream` seek modes — mirrors the enum in
/// `pluginterfaces/base/ibstream.h`.
const SEEK_SET: i32 = 0;
const SEEK_CUR: i32 = 1;
const SEEK_END: i32 = 2;

/// Host-side `IBStream` backed by an in-memory `Vec<u8>`. Used by
/// preset save (`IComponent::getState`) and load
/// (`IComponent::setState`); the buffer grows to fit writes past the
/// current end, matching `IBStream`'s implicit "stream extends on
/// write" convention.
pub struct MemoryStream {
    data: RefCell<Vec<u8>>,
    pos: RefCell<i64>,
}

impl MemoryStream {
    /// Empty stream. Callers hand its `IBStream` pointer to
    /// `getState()` and collect the resulting bytes via `into_data`.
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            data: RefCell::new(Vec::new()),
            pos: RefCell::new(0),
        })
    }

    /// Pre-populated stream. Callers hand its `IBStream` pointer to
    /// `setState()` so the plugin can read the saved bytes back.
    pub fn from_data(data: Vec<u8>) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            data: RefCell::new(data),
            pos: RefCell::new(0),
        })
    }

    /// Snapshot of the accumulated bytes. Clones because the stream
    /// may still be live (plugins occasionally retain the pointer
    /// for a moment after the call returns).
    pub fn into_data(&self) -> Vec<u8> {
        self.data.borrow().clone()
    }

    #[cfg(test)]
    pub(crate) fn position(&self) -> i64 {
        *self.pos.borrow()
    }

    #[cfg(test)]
    pub(crate) fn byte_len(&self) -> usize {
        self.data.borrow().len()
    }
}

impl Class for MemoryStream {
    type Interfaces = (IBStream,);
}

impl IBStreamTrait for MemoryStream {
    unsafe fn read(
        &self,
        buffer: *mut std::ffi::c_void,
        num_bytes: int32,
        num_bytes_read: *mut int32,
    ) -> tresult {
        let data = self.data.borrow();
        let pos = *self.pos.borrow();
        // Negative / past-end pos already means "nothing to read" —
        // some plugins seek backwards and try to read without
        // adjusting first. Treat that as an empty read rather than
        // an error, matching the companion's production behaviour.
        let pos_usize = if pos < 0 { 0 } else { pos as usize };
        let available = data.len().saturating_sub(pos_usize);
        let to_read = if num_bytes < 0 {
            0
        } else {
            (num_bytes as usize).min(available)
        };

        if to_read > 0 && !buffer.is_null() {
            ptr::copy_nonoverlapping(
                data[pos_usize..].as_ptr(),
                buffer as *mut u8,
                to_read,
            );
        }

        *self.pos.borrow_mut() = (pos_usize + to_read) as i64;

        if !num_bytes_read.is_null() {
            *num_bytes_read = to_read as int32;
        }

        kResultOk
    }

    unsafe fn write(
        &self,
        buffer: *mut std::ffi::c_void,
        num_bytes: int32,
        num_bytes_written: *mut int32,
    ) -> tresult {
        if buffer.is_null() || num_bytes <= 0 {
            if !num_bytes_written.is_null() {
                *num_bytes_written = 0;
            }
            return kResultOk;
        }

        let bytes = std::slice::from_raw_parts(buffer as *const u8, num_bytes as usize);
        let mut data = self.data.borrow_mut();
        let pos = *self.pos.borrow();
        if pos < 0 {
            return kInvalidArgument;
        }
        let pos_usize = pos as usize;

        // Extend data if writing past the end — IBStream semantics
        // grow the stream implicitly.
        if pos_usize + bytes.len() > data.len() {
            data.resize(pos_usize + bytes.len(), 0);
        }
        data[pos_usize..pos_usize + bytes.len()].copy_from_slice(bytes);

        *self.pos.borrow_mut() = (pos_usize + bytes.len()) as i64;

        if !num_bytes_written.is_null() {
            *num_bytes_written = bytes.len() as int32;
        }

        kResultOk
    }

    unsafe fn seek(&self, pos: int64, mode: int32, result: *mut int64) -> tresult {
        let data = self.data.borrow();
        let new_pos = match mode {
            SEEK_SET => pos,
            SEEK_CUR => *self.pos.borrow() + pos,
            SEEK_END => data.len() as i64 + pos,
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
        if pos.is_null() {
            return kInvalidArgument;
        }
        *pos = *self.pos.borrow();
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn write_bytes(s: &ComWrapper<MemoryStream>, bytes: &[u8]) -> i32 {
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut written: int32 = 0;
        unsafe {
            stream.write(
                bytes.as_ptr() as *mut std::ffi::c_void,
                bytes.len() as int32,
                &mut written,
            );
        }
        written
    }

    fn read_bytes(s: &ComWrapper<MemoryStream>, len: usize) -> Vec<u8> {
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut buf = vec![0u8; len];
        let mut read_count: int32 = 0;
        unsafe {
            stream.read(
                buf.as_mut_ptr() as *mut std::ffi::c_void,
                len as int32,
                &mut read_count,
            );
        }
        buf.truncate(read_count as usize);
        buf
    }

    fn seek(s: &ComWrapper<MemoryStream>, pos: i64, mode: i32) -> (tresult, i64) {
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut result: int64 = -1;
        let tr = unsafe { stream.seek(pos, mode, &mut result) };
        (tr, result)
    }

    #[test]
    fn new_stream_is_empty_at_position_zero() {
        let s = MemoryStream::new();
        assert_eq!(s.byte_len(), 0);
        assert_eq!(s.position(), 0);
    }

    #[test]
    fn write_then_read_round_trips() {
        let s = MemoryStream::new();
        let payload = b"hello VST3 world";
        let written = write_bytes(&s, payload);
        assert_eq!(written, payload.len() as i32);

        // Seek to start before reading.
        let (r, pos) = seek(&s, 0, SEEK_SET);
        assert_eq!(r, kResultOk);
        assert_eq!(pos, 0);

        let out = read_bytes(&s, payload.len());
        assert_eq!(out, payload);
    }

    #[test]
    fn from_data_serves_prefilled_bytes() {
        let s = MemoryStream::from_data(vec![1, 2, 3, 4]);
        let out = read_bytes(&s, 4);
        assert_eq!(out, vec![1, 2, 3, 4]);
    }

    #[test]
    fn seek_cur_advances_and_rewinds() {
        let s = MemoryStream::from_data(vec![0u8; 100]);
        let (_, p1) = seek(&s, 10, SEEK_SET);
        assert_eq!(p1, 10);
        let (_, p2) = seek(&s, 5, SEEK_CUR);
        assert_eq!(p2, 15);
        let (_, p3) = seek(&s, -3, SEEK_CUR);
        assert_eq!(p3, 12);
    }

    #[test]
    fn seek_end_positions_relative_to_length() {
        let s = MemoryStream::from_data(vec![0u8; 100]);
        let (_, p) = seek(&s, -10, SEEK_END);
        assert_eq!(p, 90);
        let (_, p) = seek(&s, 0, SEEK_END);
        assert_eq!(p, 100);
    }

    #[test]
    fn seek_negative_position_rejected() {
        let s = MemoryStream::new();
        let (r, _) = seek(&s, -1, SEEK_SET);
        assert_eq!(r, kInvalidArgument);
    }

    #[test]
    fn seek_unknown_mode_rejected() {
        let s = MemoryStream::new();
        let (r, _) = seek(&s, 0, 99);
        assert_eq!(r, kInvalidArgument);
    }

    #[test]
    fn tell_reports_current_position() {
        let s = MemoryStream::from_data(vec![0u8; 50]);
        seek(&s, 25, SEEK_SET);
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut pos: int64 = -1;
        let r = unsafe { stream.tell(&mut pos) };
        assert_eq!(r, kResultOk);
        assert_eq!(pos, 25);
    }

    #[test]
    fn tell_null_pointer_rejected() {
        let s = MemoryStream::new();
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let r = unsafe { stream.tell(ptr::null_mut()) };
        assert_eq!(r, kInvalidArgument);
    }

    #[test]
    fn write_past_end_extends_stream() {
        let s = MemoryStream::new();
        seek(&s, 100, SEEK_SET);
        let bytes = b"data";
        let written = write_bytes(&s, bytes);
        assert_eq!(written, bytes.len() as i32);
        assert_eq!(s.byte_len(), 104);
    }

    #[test]
    fn write_null_buffer_is_noop() {
        let s = MemoryStream::new();
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut written: int32 = -1;
        let r = unsafe {
            stream.write(ptr::null_mut(), 16, &mut written)
        };
        assert_eq!(r, kResultOk);
        assert_eq!(written, 0);
        assert_eq!(s.byte_len(), 0);
    }

    #[test]
    fn read_null_buffer_returns_count_without_copy() {
        // Per companion behaviour: a null read buffer is treated as
        // "advance the cursor past the bytes". That's sometimes used
        // by plugins to skip over sections they don't care about.
        let s = MemoryStream::from_data(vec![1, 2, 3, 4]);
        let stream = s.to_com_ptr::<IBStream>().unwrap();
        let mut read_count: int32 = -1;
        let r = unsafe {
            stream.read(ptr::null_mut(), 4, &mut read_count)
        };
        assert_eq!(r, kResultOk);
        assert_eq!(read_count, 4);
        assert_eq!(s.position(), 4);
    }

    #[test]
    fn read_past_end_returns_partial() {
        let s = MemoryStream::from_data(vec![1, 2, 3, 4]);
        seek(&s, 2, SEEK_SET);
        let out = read_bytes(&s, 10);
        assert_eq!(out, vec![3, 4]);
    }

    #[test]
    fn into_data_clones_buffer() {
        let s = MemoryStream::new();
        write_bytes(&s, b"abc");
        let first = s.into_data();
        write_bytes(&s, b"de");
        let second = s.into_data();
        assert_eq!(first, b"abc");
        assert_eq!(second, b"abcde");
    }
}

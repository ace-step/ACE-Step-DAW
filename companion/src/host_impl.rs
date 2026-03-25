//! VST3 host interface implementations.
//!
//! These COM classes are passed to VST3 plugins so they can communicate back
//! to the host (parameter changes, state persistence, etc.).

use std::cell::RefCell;
use std::ptr;

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
    String128, ParamID, ParamValue,
};

// ---------------------------------------------------------------------------
// Parameter change notification
// ---------------------------------------------------------------------------

/// A parameter change reported by the plugin (e.g. from its GUI).
#[derive(Debug, Clone)]
pub struct HostParamChange {
    pub param_id: u32,
    pub value: f64,
}

/// Implements `IComponentHandler` — receives parameter edit notifications from plugins.
///
/// Changes are pushed to a lock-free queue for the WebSocket thread to consume.
pub struct AceComponentHandler {
    pub changes: SegQueue<HostParamChange>,
}

impl AceComponentHandler {
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
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
        self.changes.push(HostParamChange {
            param_id: id,
            value: valueNormalized,
        });
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
}

//! Host-side `IParameterChanges` + `IParamValueQueue` for Phase 4B-2b.
//!
//! Unlike 4B-2a's MIDI port, this module has **no reference
//! implementation** in the companion app — its `process_vst3_multi`
//! always passed `inputParameterChanges: ptr::null_mut()` with a
//! `TODO`. Everything here is built fresh against the Steinberg SDK
//! signatures surfaced by the `vst3` crate.
//!
//! ## Model
//!
//! VST3's `IParameterChanges` is a **list of per-parameter queues**,
//! not a flat list of events:
//!
//! - One `IParamValueQueue` per `ParamID` touched this block.
//! - Each queue holds `(sampleOffset, normalisedValue)` points.
//! - The plugin iterates queues forward by index; within a queue, the
//!   host is expected to keep points sorted by `sampleOffset`.
//!
//! The host side of the flow is built in `process_block`:
//!
//! 1. Drain a flat `SegQueue<ParamPoint>` from the instance.
//! 2. Filter to the current block window (points with
//!    `sample_offset >= samples` belong to a later block).
//! 3. Group by `param_id`.
//! 4. Sort each group by `sample_offset`.
//! 5. Build a `ParameterChanges` containing one `ParamValueQueue`
//!    per group, and hand the pointer to `process()` via
//!    `ProcessData::inputParameterChanges`.
//!
//! ## Ownership
//!
//! `ComWrapper<ParameterChanges>` owns its child `ComWrapper<ParamValueQueue>`
//! instances (wrapped in `ComPtr` so their refcount is held). The
//! plugin reads through the pointer we hand it during `process()`
//! but never retains it past the call, so the wrapper lives on the
//! host stack for the block duration.

use std::cell::RefCell;

use vst3::Steinberg::Vst::{
    IParamValueQueue, IParamValueQueueTrait, IParameterChanges, IParameterChangesTrait, ParamID,
    ParamValue,
};
use vst3::Steinberg::{int32, kInvalidArgument, kResultOk, tresult};
use vst3::{Class, ComPtr, ComWrapper};

/// A single host-side parameter automation point. Kept in a flat
/// `SegQueue` on the instance until `process_block` drains it. Matches
/// the shape of MIDI's `MidiEvent` so the two pipelines are
/// symmetric.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ParamPoint {
    pub param_id: ParamID,
    pub sample_offset: u32,
    /// VST3 normalised value in `[0.0, 1.0]`. Callers get the
    /// normalisation range via `ParamInfo::min_value` /
    /// `max_value` — both are always 0 and 1 at the wire per the
    /// 4A-3 contract.
    pub value: f64,
}

// ---------------------------------------------------------------------------
// IParamValueQueue — per-parameter point list
// ---------------------------------------------------------------------------

/// Host-side `IParamValueQueue`. Holds all the automation points
/// for a single parameter id within one processing block.
pub struct ParamValueQueue {
    id: ParamID,
    /// Sample-offset + normalised value. Kept sorted by
    /// `sampleOffset` so plugins iterating `getPoint(0..)` see
    /// ascending times — VST3 expects this but doesn't enforce it.
    points: RefCell<Vec<(i32, ParamValue)>>,
}

impl ParamValueQueue {
    pub fn new(id: ParamID) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            id,
            points: RefCell::new(Vec::new()),
        })
    }

    pub fn with_points(id: ParamID, mut points: Vec<(i32, ParamValue)>) -> ComWrapper<Self> {
        // Sort defensively — caller should already sort but we don't
        // trust other modules to uphold the invariant.
        points.sort_by_key(|(offset, _)| *offset);
        ComWrapper::new(Self {
            id,
            points: RefCell::new(points),
        })
    }
}

impl Class for ParamValueQueue {
    type Interfaces = (IParamValueQueue,);
}

impl IParamValueQueueTrait for ParamValueQueue {
    unsafe fn getParameterId(&self) -> ParamID {
        self.id
    }

    unsafe fn getPointCount(&self) -> int32 {
        self.points.borrow().len() as int32
    }

    unsafe fn getPoint(
        &self,
        index: int32,
        sample_offset: *mut int32,
        value: *mut ParamValue,
    ) -> tresult {
        if sample_offset.is_null() || value.is_null() {
            return kInvalidArgument;
        }
        let points = self.points.borrow();
        if index < 0 || (index as usize) >= points.len() {
            return kInvalidArgument;
        }
        let (off, val) = points[index as usize];
        *sample_offset = off;
        *value = val;
        kResultOk
    }

    unsafe fn addPoint(
        &self,
        sample_offset: int32,
        value: ParamValue,
        index: *mut int32,
    ) -> tresult {
        if index.is_null() {
            return kInvalidArgument;
        }
        let mut points = self.points.borrow_mut();
        // VST3 semantics: addPoint inserts maintaining sort order and
        // returns the index at which the point was placed. Callers
        // (including plugins that write into output queues) rely on
        // this rather than doing their own sort pass.
        let pos = points
            .binary_search_by_key(&sample_offset, |(off, _)| *off)
            .unwrap_or_else(|e| e);
        points.insert(pos, (sample_offset, value));
        *index = pos as int32;
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// IParameterChanges — list of per-parameter queues
// ---------------------------------------------------------------------------

/// Host-side `IParameterChanges`. Holds one `ParamValueQueue` per
/// parameter id touched during the current block. The
/// `ComPtr<IParamValueQueue>` stored here keeps each child queue's
/// COM refcount incremented for the lifetime of the parent — so
/// pointers returned from `getParameterData` stay valid as long as
/// the parent's `ComWrapper` does.
pub struct ParameterChanges {
    queues: RefCell<Vec<ComPtr<IParamValueQueue>>>,
}

impl ParameterChanges {
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            queues: RefCell::new(Vec::new()),
        })
    }

    /// Pre-populate from already-grouped points. `grouped` is a list
    /// of `(param_id, sorted_points)` pairs. Each group becomes one
    /// `ParamValueQueue`.
    pub fn with_groups(grouped: Vec<(ParamID, Vec<(i32, ParamValue)>)>) -> ComWrapper<Self> {
        let queues: Vec<ComPtr<IParamValueQueue>> = grouped
            .into_iter()
            .filter_map(|(id, points)| {
                ParamValueQueue::with_points(id, points).to_com_ptr::<IParamValueQueue>()
            })
            .collect();
        ComWrapper::new(Self {
            queues: RefCell::new(queues),
        })
    }
}

impl Class for ParameterChanges {
    type Interfaces = (IParameterChanges,);
}

impl IParameterChangesTrait for ParameterChanges {
    unsafe fn getParameterCount(&self) -> int32 {
        self.queues.borrow().len() as int32
    }

    unsafe fn getParameterData(&self, index: int32) -> *mut IParamValueQueue {
        let queues = self.queues.borrow();
        if index < 0 || (index as usize) >= queues.len() {
            return std::ptr::null_mut();
        }
        queues[index as usize].as_ptr()
    }

    unsafe fn addParameterData(
        &self,
        id: *const ParamID,
        index: *mut int32,
    ) -> *mut IParamValueQueue {
        if id.is_null() || index.is_null() {
            return std::ptr::null_mut();
        }
        let target = *id;
        let mut queues = self.queues.borrow_mut();

        // If we already have a queue for this id, return its pointer
        // (spec-compliant de-dup: addParameterData should not create
        // a duplicate queue for the same id).
        for (i, q) in queues.iter().enumerate() {
            if q.getParameterId() == target {
                *index = i as int32;
                return q.as_ptr();
            }
        }

        // Otherwise create a fresh queue.
        let new_q = match ParamValueQueue::new(target).to_com_ptr::<IParamValueQueue>() {
            Some(q) => q,
            None => return std::ptr::null_mut(),
        };
        let raw = new_q.as_ptr();
        queues.push(new_q);
        *index = (queues.len() - 1) as int32;
        raw
    }
}

// ---------------------------------------------------------------------------
// Host-side grouping helpers
// ---------------------------------------------------------------------------

/// Group a flat list of param points into per-id, sorted vectors
/// suitable for `ParameterChanges::with_groups`. Pure logic —
/// exercised by unit tests without touching COM.
///
/// - Points with `sample_offset >= block_samples` are dropped
///   (mirrors the MIDI block-window filter from 4B-2a).
/// - `sample_offset` values past `i32::MAX` are also dropped
///   (would wrap negative in VST3's `i32` field).
/// - Preserves insertion order across identical `(param_id,
///   sample_offset)` tuples — callers that need strict determinism
///   for equal offsets must stamp a monotonic counter themselves.
pub(crate) fn group_points_for_block(
    mut points: Vec<ParamPoint>,
    block_samples: u32,
) -> Vec<(ParamID, Vec<(i32, ParamValue)>)> {
    points.retain(|p| p.sample_offset < block_samples);

    // Sort primarily by id so we can walk the list in one pass to
    // group. Secondary sort by sample_offset for within-group
    // ordering. Stable sort keeps original insertion order for
    // tie-breaks.
    points.sort_by(|a, b| {
        a.param_id
            .cmp(&b.param_id)
            .then(a.sample_offset.cmp(&b.sample_offset))
    });

    let mut out: Vec<(ParamID, Vec<(i32, ParamValue)>)> = Vec::new();
    for p in points {
        let offset = match i32::try_from(p.sample_offset) {
            Ok(v) => v,
            Err(_) => continue,
        };
        match out.last_mut() {
            Some((id, ref mut pts)) if *id == p.param_id => {
                pts.push((offset, p.value));
            }
            _ => {
                out.push((p.param_id, vec![(offset, p.value)]));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -------- grouping (pure logic) --------

    #[test]
    fn group_points_splits_by_param_id() {
        let points = vec![
            ParamPoint { param_id: 1, sample_offset: 0, value: 0.25 },
            ParamPoint { param_id: 2, sample_offset: 0, value: 0.5 },
            ParamPoint { param_id: 1, sample_offset: 100, value: 0.75 },
        ];
        let groups = group_points_for_block(points, 512);
        assert_eq!(groups.len(), 2);
        let p1 = groups.iter().find(|(id, _)| *id == 1).unwrap();
        assert_eq!(p1.1.len(), 2);
        let p2 = groups.iter().find(|(id, _)| *id == 2).unwrap();
        assert_eq!(p2.1.len(), 1);
    }

    #[test]
    fn group_points_sorts_within_group_by_sample_offset() {
        let points = vec![
            ParamPoint { param_id: 7, sample_offset: 256, value: 0.9 },
            ParamPoint { param_id: 7, sample_offset: 0, value: 0.1 },
            ParamPoint { param_id: 7, sample_offset: 128, value: 0.5 },
        ];
        let groups = group_points_for_block(points, 512);
        assert_eq!(groups.len(), 1);
        let (_, pts) = &groups[0];
        assert_eq!(pts[0].0, 0);
        assert_eq!(pts[1].0, 128);
        assert_eq!(pts[2].0, 256);
    }

    #[test]
    fn group_points_drops_points_past_block_window() {
        let points = vec![
            ParamPoint { param_id: 1, sample_offset: 0, value: 0.5 },
            ParamPoint { param_id: 1, sample_offset: 512, value: 0.6 }, // at boundary, drop
            ParamPoint { param_id: 1, sample_offset: 1024, value: 0.7 }, // past, drop
        ];
        let groups = group_points_for_block(points, 512);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].1.len(), 1);
        assert_eq!(groups[0].1[0].0, 0);
    }

    #[test]
    fn group_points_drops_points_past_i32_max() {
        let points = vec![ParamPoint {
            param_id: 1,
            sample_offset: (i32::MAX as u32) + 1,
            value: 0.5,
        }];
        let groups = group_points_for_block(points, u32::MAX);
        assert!(groups.is_empty());
    }

    #[test]
    fn group_points_empty_input_returns_empty() {
        assert!(group_points_for_block(vec![], 512).is_empty());
    }

    // -------- ParamValueQueue COM class --------

    #[test]
    fn param_value_queue_exposes_param_id() {
        let q = ParamValueQueue::new(42);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        unsafe {
            assert_eq!(ptr.getParameterId(), 42);
            assert_eq!(ptr.getPointCount(), 0);
        }
    }

    #[test]
    fn param_value_queue_with_points_reports_count() {
        let q = ParamValueQueue::with_points(7, vec![(0, 0.1), (128, 0.5), (256, 0.9)]);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        unsafe {
            assert_eq!(ptr.getPointCount(), 3);
        }
    }

    #[test]
    fn param_value_queue_get_point_round_trips() {
        let q = ParamValueQueue::with_points(7, vec![(128, 0.5)]);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        let mut off: int32 = -1;
        let mut val: ParamValue = -1.0;
        let r = unsafe { ptr.getPoint(0, &mut off, &mut val) };
        assert_eq!(r, kResultOk);
        assert_eq!(off, 128);
        assert!((val - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn param_value_queue_get_point_rejects_out_of_bounds() {
        let q = ParamValueQueue::new(1);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        let mut off: int32 = 0;
        let mut val: ParamValue = 0.0;
        unsafe {
            assert_eq!(ptr.getPoint(-1, &mut off, &mut val), kInvalidArgument);
            assert_eq!(ptr.getPoint(0, &mut off, &mut val), kInvalidArgument);
        }
    }

    #[test]
    fn param_value_queue_get_point_rejects_null_outputs() {
        let q = ParamValueQueue::with_points(1, vec![(0, 0.5)]);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        let mut val: ParamValue = 0.0;
        let mut off: int32 = 0;
        unsafe {
            assert_eq!(
                ptr.getPoint(0, std::ptr::null_mut(), &mut val),
                kInvalidArgument
            );
            assert_eq!(
                ptr.getPoint(0, &mut off, std::ptr::null_mut()),
                kInvalidArgument
            );
        }
    }

    #[test]
    fn param_value_queue_add_point_inserts_in_sort_order() {
        let q = ParamValueQueue::new(1);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        let mut idx: int32 = -1;
        unsafe {
            assert_eq!(ptr.addPoint(256, 0.9, &mut idx), kResultOk);
            assert_eq!(idx, 0);
            assert_eq!(ptr.addPoint(0, 0.1, &mut idx), kResultOk);
            assert_eq!(idx, 0); // inserted before 256
            assert_eq!(ptr.addPoint(128, 0.5, &mut idx), kResultOk);
            assert_eq!(idx, 1); // between 0 and 256

            // Verify final ordering.
            let mut off: int32 = 0;
            let mut val: ParamValue = 0.0;
            ptr.getPoint(0, &mut off, &mut val);
            assert_eq!(off, 0);
            ptr.getPoint(1, &mut off, &mut val);
            assert_eq!(off, 128);
            ptr.getPoint(2, &mut off, &mut val);
            assert_eq!(off, 256);
        }
    }

    #[test]
    fn param_value_queue_add_point_rejects_null_index() {
        let q = ParamValueQueue::new(1);
        let ptr = q.to_com_ptr::<IParamValueQueue>().unwrap();
        unsafe {
            assert_eq!(
                ptr.addPoint(0, 0.5, std::ptr::null_mut()),
                kInvalidArgument
            );
        }
    }

    // -------- ParameterChanges COM class --------

    #[test]
    fn parameter_changes_empty_on_construction() {
        let pc = ParameterChanges::new();
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        unsafe {
            assert_eq!(ptr.getParameterCount(), 0);
            assert!(ptr.getParameterData(0).is_null());
        }
    }

    #[test]
    fn parameter_changes_with_groups_exposes_each_queue() {
        let pc = ParameterChanges::with_groups(vec![
            (1, vec![(0, 0.25)]),
            (2, vec![(0, 0.5), (128, 0.75)]),
        ]);
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        unsafe {
            assert_eq!(ptr.getParameterCount(), 2);

            let q0 = ptr.getParameterData(0);
            assert!(!q0.is_null());
            let q1 = ptr.getParameterData(1);
            assert!(!q1.is_null());
        }
    }

    #[test]
    fn parameter_changes_get_data_rejects_out_of_bounds() {
        let pc = ParameterChanges::new();
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        unsafe {
            assert!(ptr.getParameterData(-1).is_null());
            assert!(ptr.getParameterData(0).is_null());
        }
    }

    #[test]
    fn parameter_changes_add_parameter_data_creates_new_queue() {
        let pc = ParameterChanges::new();
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        let id: ParamID = 42;
        let mut idx: int32 = -1;
        unsafe {
            let q_ptr = ptr.addParameterData(&id, &mut idx);
            assert!(!q_ptr.is_null());
            assert_eq!(idx, 0);
            assert_eq!(ptr.getParameterCount(), 1);
        }
    }

    #[test]
    fn parameter_changes_add_parameter_data_dedupes_by_id() {
        let pc = ParameterChanges::new();
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        let id: ParamID = 42;
        let mut idx1: int32 = -1;
        let mut idx2: int32 = -1;
        unsafe {
            let q1 = ptr.addParameterData(&id, &mut idx1);
            let q2 = ptr.addParameterData(&id, &mut idx2);
            // Same id → same queue (spec: addParameterData de-dups).
            assert_eq!(idx1, idx2);
            assert_eq!(q1, q2);
            assert_eq!(ptr.getParameterCount(), 1);
        }
    }

    #[test]
    fn parameter_changes_add_parameter_data_rejects_null() {
        let pc = ParameterChanges::new();
        let ptr = pc.to_com_ptr::<IParameterChanges>().unwrap();
        let mut idx: int32 = 0;
        let id: ParamID = 1;
        unsafe {
            assert!(ptr
                .addParameterData(std::ptr::null(), &mut idx)
                .is_null());
            assert!(ptr
                .addParameterData(&id, std::ptr::null_mut())
                .is_null());
        }
    }
}

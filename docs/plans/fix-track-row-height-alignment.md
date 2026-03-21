## User Stories

- As a user, I want each track header row to align vertically with its timeline lane, so that the arrangement view feels clean and readable.
- As an AI agent, I want empty arrangement rows to use the same shared row-height rules on both the track list and timeline, so that drag-and-drop targeting stays visually trustworthy.

## Problem

Track rows in the left track list and the right timeline do not share a single layout source of truth. This creates visible vertical drift, especially for group tracks and any future height tuning.

## Root Cause

- `src/components/tracks/TrackHeader.tsx` computes rendered row height inline and shrinks group tracks to `Math.max(40, laneHeight * 0.7)`.
- `src/components/timeline/TrackLane.tsx` renders the matching timeline lane at raw `laneHeight`, so the same row can be two different heights.
- `src/components/tracks/TrackList.tsx` and `src/components/timeline/Timeline.tsx` each hardcode placeholder row height as `64`, instead of using a shared arrangement-row layout token.

## Solution

- Introduce a shared arrangement row-height helper for rendered track rows and placeholder rows.
- Update track headers and timeline lanes to consume the same helper.
- Replace duplicated placeholder height constants with the shared default row height token.
- Add regression tests for the shared row-height rules.

## Verification

- `npx tsc --noEmit`
- `npm run build`
- Focused tests for the arrangement row-height helper
- Browser verification that track headers and timeline lanes report matching heights for the same track types

## Files To Touch

- `docs/plans/fix-track-row-height-alignment.md`
- `src/components/arrangement/rowLayout.ts`
- `src/components/tracks/TrackHeader.tsx`
- `src/components/tracks/TrackList.tsx`
- `src/components/timeline/TrackLane.tsx`
- `src/components/timeline/Timeline.tsx`
- `src/components/arrangement/__tests__/rowLayout.test.ts`

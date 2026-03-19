# Clip Fades Competitive Research

Date: 2026-03-19

Primary source:
- Ableton Live 12 Manual, Arrangement View -> Audio Clip Fades and Crossfades
- https://www.ableton.com/en/live-manual/12/arrangement-view/

Observed interaction details:
- Fade controls are clip-level, not track-level. A fade stays with the clip when edited.
- Fade handles live on the left and right clip edges and only appear when the track lane is tall enough to expose them clearly.
- Start and end fades cannot overlap each other.
- Fade editing is separate from automation envelopes.
- Ableton also supports curve-shape editing and adjacent-clip crossfades, but those are a later scope than basic per-clip fade handles.
- Ableton documents very short default edge fades to avoid clicks/pops when automatic edge fades are enabled.

Implementation decisions for ACE-Step:
- Match the clip-level ownership model: fade durations are stored on each clip.
- Enforce non-overlap at the data layer so UI drags and store actions cannot create invalid fade states.
- Keep fades independent from the existing clip gain envelope so both can coexist during playback.
- Start with direct left/right fade handles and playback automation first; defer crossfades and separate curve-handle UI to later iterations.

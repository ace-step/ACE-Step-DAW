# Drum Machine & Step Sequencer UX Research

> Date: 2026-03-27 | Scope: Drum machine/sequencer UX in hardware + DAWs vs ACE-Step

---

## 1. Elektron — Gold Standard for Step Sequencing

### Parameter Locks (P-Locks)
- **Per-step parameter changes**: Every step can have unique pitch, amp, filter, decay, sample, etc.
- **Workflow**: Hold step button + turn knob = parameter lock on that step
- **LED feedback**: Locked step LED flashes rapidly
- **Limits**: Up to 72 unique parameter locks per pattern (Analog Rytm)
- **Why it matters**: "Elektron gets so much love because many machines can parameter lock sounds per step"

### Sound Locks
- **Per-step sample switching**: Assign different sample to each step on same track
- **Use case**: Kick track can also play toms, percussion on specific steps
- **Eliminates track waste**: Don't need 4 tracks for 4 tom hits

### Conditional Trigs (Probability)
- **Per-step probability**: 1-100% chance of triggering
- **Logical conditions**: "Play on 2nd loop only", "Play if previous trig fired"
- **Fill mode**: Steps that only play when Fill button is held
- **Mutual exclusion**: A/B trigs — one OR the other, never both

### Digitakt II (2025) — Latest Evolution
- **128 steps** (double previous)
- **Euclidean sequence generator**: Math-based pattern distribution
- **16 levels of velocity**: Per-step velocity grid
- **Retrig mode**: Rapid-fire retriggering (ratchets)
- **Preset pool**: Load multiple sounds per track for sound locks

### What Users Want in Software Equivalents
- Different sequence length per track (polyrhythm)
- Different time division per track
- Parameter locks on maximum parameters
- Different playback direction per track
- Ratchets, probability, conditional trigs
- Velocity, gate, accent, slide per step

## 2. Ableton Drum Rack + Step Sequencer

### Drum Rack
- **128 pad slots**: Far more than the standard 16
- **Per-pad chain**: Each pad has its own instrument + effect chain
- **Choke groups**: 16 configurable choke groups
- **Macro knobs**: 8 assignable macros
- **Return chains**: Parallel send effects within the rack
- **Drag-and-drop sample assignment**: From browser to pad

### 16 Velocities Mode
- **Spread velocity across 16 pads**: One sound, 16 velocity levels
- **MPC-style velocity mapping**: Physical finger pressure = velocity

## 3. Logic Pro Step Sequencer (10.5+)

### Row-Based Design
- Each row = one sound (kit piece or note)
- **Per-step editing**: Velocity, gate, tie, skip, loop point
- **Pattern regions**: Place step patterns on timeline like clips
- **Visual velocity**: Color gradient on steps (cool→hot)

## 4. MPC / Maschine

### Performance-First Design
- **4x4 pad grid**: Industry standard layout
- **Finger drumming**: Real-time velocity from pad pressure
- **Note repeat**: Hold pad + repeat button = rapid-fire at tempo subdivision
- **Pad mode switching**: Pad, Keyboard, 16 Levels, Step Seq
- **Per-pad tuning**: Pitch knob per pad
- **Chop mode**: Slice sample and assign slices to pads

## 5. Roland TR-808/909 (Hardware Legacy)

### Step Pattern Entry
- 16 step buttons, each represents one 16th note
- **Toggle on/off**: Press step button to activate
- **Accent**: Separate accent button toggles per step
- **Instrument select**: Choose kick/snare/hat, then edit its pattern
- **LED step indicator**: Current playing step lights up

## 6. ACE-Step Current State

### DrumMachineEditor.tsx
- **4x4 pad grid**: 16 pads with unique colors
- **MPC-style velocity**: Mouse Y position determines velocity (innovative!)
- **Keyboard mapping**: ZXCV/ASDF/QWER/1234 for pads
- **Kit selection**: 808, Acoustic, Electronic, Lo-Fi
- **Visual feedback**: 150ms active state highlight
- **Per-pad volume**: Volume fader per pad

### SequencerEditor.tsx
- Step grid with toggle on/off
- Per-step velocity
- Swing control (0-100%)
- 7 preset patterns (Rock, Pop, Hip-Hop, EDM, Reggae, Jazz, Bossa Nova)

### Key Gaps
| Feature | Elektron | MPC | Ableton | ACE-Step |
|---|---|---|---|---|
| Per-step parameter locks | Yes (best) | No | No | No |
| Per-step probability | Yes | No | No | No |
| Conditional trigs | Yes | No | No | No |
| Note repeat / ratchet | Yes | Yes | No | No |
| Per-step pitch offset | Yes | No | No | No |
| Polyrhythmic rows | Yes | No | No | No |
| Choke groups | Yes | No | Yes | No |
| Sample loading per pad | Yes | Yes | Yes | No |
| 128 pad slots | No | No | Yes | 16 only |
| Pattern chaining | Yes | Yes | Yes | No |
| Euclidean generator | Yes (Digitakt II) | No | No | No |

---

## 7. Recommendations for ACE-Step

### Phase 1: Essential
- Per-step velocity painting (drag across velocity bars)
- Sample loading per pad (drag-and-drop audio files)
- Choke groups (hi-hat closed chokes open)

### Phase 2: Creative
- Per-step probability (right-click step → set %)
- Per-step pitch offset (±12 semitones)
- Note repeat / ratchet (2x/3x/4x subdivisions)
- Pattern chaining (A→B→Fill sequence)

### Phase 3: Advanced
- Parameter locks (per-step filter, decay, pan)
- Polyrhythmic rows (different step counts per row)
- Euclidean pattern generator
- Micro-timing nudge per step

---

## Sources

- [Elektron Analog Rytm Manual — Sequencer Features, Parameter Locks](https://www.manualsdir.com/manuals/657159/elektron-analog-rytm.html?page=48)
- [Digitakt II — Creativity-Unlocking 16 Track Drum Computer](https://www.elektron.se/explore/digitakt-ii)
- [Parameter Locking: What Is It Exactly? — Loopy Pro Forum](https://forum.loopypro.com/discussion/26340/parameter-locking-what-is-it-exactly)
- [Software Step Sequencer with Elektron-Like Features? — Gearspace](https://gearspace.com/board/electronic-music-instruments-and-electronic-music-production/1405617-software-step-sequencer-quot-elektron-like-quot-features.html)

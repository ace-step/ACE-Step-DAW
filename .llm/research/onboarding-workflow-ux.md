# Onboarding & Workflow UX Research

> Date: 2026-03-27 | Scope: First-run experience and workflow design in DAWs vs ACE-Step

---

## 1. GarageBand — Gold Standard for Simplicity

### Zero-Friction Start
- **Open → pick instrument → play**: Under 30 seconds to first sound
- **No configuration needed**: Auto-detects audio interface, sets buffer/sample rate
- **Live Loops grid**: Tap cells to trigger loops — music within 10 seconds
- **Sound Library**: Curated, categorized, immediate preview
- **Smart instruments**: Auto-chord strumming, drum machine with one-tap patterns

### Progressive Complexity
- **Drummer track**: AI drummer that follows your song (adjusts complexity, fills, pattern)
- **Track types are clear**: Audio, Instrument, Drummer — no jargon
- **Export to Logic**: Seamless upgrade path when users outgrow GarageBand

### What Makes It Work
- **Opinionated defaults**: 120 BPM, 4/4, C major — just go
- **No empty state**: Always starts with a template or instrument ready
- **Visual, not technical**: Knobs look like physical knobs, not parameter sliders

## 2. BandLab — Free Cloud DAW Onboarding

### Instant Access
- **No download, no payment**: Open browser → sign up → create
- **Mobile-first**: iOS/Android apps with same project format
- **Social features**: Follow artists, remix public tracks, comment on waveforms
- **Templates**: Genre-specific starting points with pre-loaded loops

### Collaboration as Default
- **Share link → co-edit**: Real-time collaboration built into the core flow
- **Fork/remix**: Public projects can be forked (like GitHub for music)
- **In-app recording**: Record vocals/guitar directly in browser
- **Mastering**: One-click AI mastering (free)

## 3. Cakewalk Next — Modern Onboarding Redesign

### Simplified from Cakewalk/SONAR
- **Guided first session**: Step-by-step tutorial overlay on first launch
- **Quick start templates**: Electronic, Rock, Hip-Hop, Singer/Songwriter
- **Contextual help**: ? icons that explain each section on hover
- **Streamlined UI**: Removed power-user features from default view
- **Cloud projects**: Save to cloud by default, local export optional

## 4. Ableton Live — Session View as Playground

### Unique Onboarding Advantage
- **Session View**: Non-linear clip launching — experimentation without commitment
- **Record to Arrangement**: Move from exploration to structure naturally
- **Built-in lessons**: Interactive tutorials in the Help menu
- **Pack browser**: Curated sound packs with preview

### Pain Points (from user research)
- **Steep learning curve**: Dual-view concept confuses beginners
- **No guided tour**: Users must seek out lessons themselves
- **Browser overwhelm**: Too many presets/samples without curation for beginners

## 5. FL Studio — Pattern-First Workflow

### Beginner-Friendly Pattern System
- **Channel Rack**: Add instruments, draw patterns — visual and immediate
- **Step sequencer**: Toggle steps on/off for drums — most intuitive beat-making
- **Playlist**: Arrange patterns on timeline — separation of "create" and "arrange"
- **Lifetime free updates**: Buy once, never worry about versions

### Onboarding Flow
- **Demo songs**: Ships with complete projects to study
- **Suggested channels**: Pre-loaded with kick, clap, hat, snare
- **Right-click help**: Every element has "What's this?" in context menu

## 6. AI-First Music Tools — New Paradigm

### Suno / Udio
- **Text prompt → full song**: No musical knowledge required
- **Genre/mood selection**: Dropdown instead of technical parameters
- **Iterate by description**: "Make the chorus more energetic"
- **Relevance to ACE-Step**: ACE-Step already has AI generation — onboarding should lean into this

### AIVA
- **Genre template → AI composition**: MIDI output that users can edit
- **Emotion-based presets**: "Joyful", "Tense", "Melancholic"
- **Progressive editing**: Start with AI, gradually take manual control

### Implications for ACE-Step
- **AI generation IS the onboarding**: New users generate a track first, then learn to edit
- **Prompt-to-music eliminates empty canvas fear**: Most powerful onboarding possible
- **Hybrid flow**: Generate → inspect → modify → learn

## 7. ACE-Step Current State

### What Exists
- Project loads with empty timeline
- Track type selection: stems, sample, sequencer, pianoroll
- AI generation panel (ACE-Step model integration)
- Keyboard shortcuts dialog
- Template system (project templates exist in store)

### Key Gaps
| Feature | Competitors | ACE-Step |
|---|---|---|
| Guided first-run tour | GarageBand, Cakewalk Next | No |
| Template gallery on launch | All | Empty project |
| Interactive tutorials | Ableton, GarageBand | No |
| Demo projects | FL Studio, Logic | No |
| Contextual help tooltips | Cakewalk Next, Logic | Keyboard shortcuts only |
| Progressive disclosure | GarageBand, Logic Alchemy | Partial |
| AI-first onboarding flow | Suno/Udio concept | AI exists but not as entry point |
| Quick start wizard | BandLab | No |

---

## 8. Recommendations for ACE-Step

### Phase 1: First-Run Experience
- **AI-first onboarding**: New users land on "Describe your song" prompt
- **Generate → Edit flow**: AI creates initial track, user learns editing by modifying it
- **Template gallery**: Show genre templates instead of empty project
- **Contextual tooltips**: Hover hints on every major UI element (500ms delay)

### Phase 2: Learning System
- **Interactive walkthrough**: Step-by-step overlay highlighting timeline, mixer, piano roll
- **Demo projects**: 3-5 complete projects users can explore and modify
- **"What's this?" mode**: Toggle that shows explanations on click
- **Progress badges**: Track user's feature discovery (optional gamification)

### Phase 3: Workflow Optimization
- **Quick start wizard**: BPM, key, genre, track count → pre-configured project
- **Workflow presets**: "Beat Making", "Songwriting", "Sound Design" — each shows relevant panels
- **Keyboard shortcut trainer**: Interactive drill for common shortcuts

---

## Sources

- [GarageBand for Mac — Apple](https://www.apple.com/mac/garageband/)
- [BandLab: Make Music Online — Free DAW](https://www.bandlab.com/)
- [Cakewalk Next: A New Beginning — BandLab Blog](https://blog.bandlab.com/cakewalk-next/)
- [Ableton Live 12 — Learn Live Tutorials](https://www.ableton.com/en/live/learn-live/)
- [Suno AI Music Generator](https://suno.com/)
- [AIVA: The AI Music Composition Assistant](https://www.aiva.ai/)

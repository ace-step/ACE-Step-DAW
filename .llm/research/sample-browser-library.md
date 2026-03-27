# Sample Browser & Library UX Research

> Date: 2026-03-27 | Scope: Sample browsing, library management, and audio preview in DAWs vs ACE-Step

---

## 1. Ableton Live Browser — Industry Reference

### Architecture
- **Left sidebar**: Always accessible, collapsible with Cmd+Alt+B
- **Category tabs**: Sounds, Drums, Instruments, Audio Effects, MIDI Effects, Max for Live, Samples, Packs
- **Search**: Unified search across all categories with real-time filtering
- **Tags**: Color tags for user organization, auto-tags by content type
- **Collections**: User-created labeled groups (like playlists for sounds)

### Live 12.3 — Splice Integration
- **In-DAW Splice browsing**: Search Splice catalog directly from Ableton browser
- **One-click download**: Download sample → immediately available in browser
- **Preview in context**: Audition Splice samples at project tempo
- **Seamless workflow**: No app switching to find/download samples

### Search with Sound (AI Feature)
- **Audio-based search**: Drag audio clip → find similar sounds in library
- **Timbre matching**: Uses ML to match sonic characteristics, not just tags
- **Replacement workflow**: "Find me a similar kick but punchier"

### Preview System
- **Pre-listen button**: Headphone icon to toggle preview
- **Tempo-synced preview**: Loops play at project BPM (warped automatically)
- **Preview volume**: Independent volume control for preview
- **Hot-swap**: Press Q to swap device — hear replacements live while music plays

### Drag-and-Drop
- **Drag to track**: Creates new clip with sample
- **Drag to Drum Rack pad**: Assigns sample to pad
- **Drag to Simpler/Sampler**: Loads as instrument
- **Drag to arrangement**: Places audio clip at drop point

## 2. Logic Pro Sound Library

### Library Panel
- **Patch browser**: Instruments organized by category (Keyboards, Strings, Synth Leads, etc.)
- **Loop browser**: Apple Loops with key, tempo, genre, instrument tags
- **Sound Effects**: Cinematic, foley, ambient categories
- **Download on demand**: Core library installed, expanded packs downloadable

### Apple Loops
- **Key/tempo matching**: Loops auto-transpose and time-stretch to project settings
- **Color coding**: Green = audio loop, Blue = MIDI/Software Instrument loop
- **Favorites**: Star to bookmark frequently used loops
- **Column browser**: Filter by genre → instrument → mood

## 3. FL Studio Browser

### File Browser
- **Tree structure**: Folders with expandable subfolders
- **Plugin presets**: Browse presets per plugin in tree
- **Favorites**: Drag items to favorites folder
- **Search**: Filter current folder by text
- **Score templates**: MIDI pattern presets (chord progressions, arpeggios)

### DirectWave Sampler
- **Multi-sample management**: Map samples across keyboard zones
- **Auto-mapping**: Detect pitch and assign to correct notes
- **Batch processing**: Apply processing to all samples at once

## 4. Splice Desktop Integration

### Standalone Model
- **Desktop app**: Browse, preview, download independently of DAW
- **Credit system**: Monthly credits for sample downloads
- **Smart search**: Filter by BPM, key, genre, instrument, mood
- **Similar sounds**: "More like this" button on any sample
- **Stems separation**: AI stem extraction from full tracks

### DAW Integration Patterns
- **Ableton 12.3**: Native browser integration (first DAW to do this)
- **Other DAWs**: Drag from Splice desktop app to DAW (cross-app drag-and-drop)
- **Sync folder**: Downloaded samples appear in configured folder → auto-index

## 5. Web-Based Sample Platforms

### Freesound.org
- **Creative Commons samples**: Free, community-contributed
- **API access**: Programmatic search and download
- **Waveform preview**: Visual waveform + play button
- **Tags + text search**: Community-tagged with description search

### Loopcloud
- **In-DAW plugin**: Browse + audition without leaving DAW
- **Key/BPM detection**: Auto-detected and displayed
- **Effect processing**: Apply effects before downloading
- **AI tagging**: Automatic categorization

## 6. ACE-Step Current State

### What Exists
- **LibraryPanel.tsx**: File browser with folder tree
- **Sample preview**: Play button on audio files
- **Drag-and-drop**: From library to timeline (basic)
- **File type support**: WAV, MP3 (via Web Audio API)
- **No tag system**: Files shown by directory structure only
- **No search**: Must navigate folder tree manually

### Key Gaps
| Feature | Competitors | ACE-Step |
|---|---|---|
| Text search | All | No |
| Tag/category filtering | All | No |
| Tempo-synced preview | Ableton, Logic | No sync |
| Key detection | Ableton, Logic, Splice | No |
| BPM detection | All | No |
| Audio similarity search | Ableton (Search with Sound) | No |
| Favorites/bookmarks | All | No |
| Collections/playlists | Ableton | No |
| Cloud sample integration | Ableton+Splice, Loopcloud | No |
| Hot-swap mode | Ableton | No |
| Drag to instrument/pad | Ableton, FL | Basic drag only |
| Waveform preview display | All | No waveform |

---

## 7. Recommendations for ACE-Step

### Phase 1: Usable Browser
- **Text search**: Real-time filter as user types
- **Waveform preview**: Show waveform thumbnail + play button
- **Favorites**: Star icon to bookmark samples
- **BPM/key display**: Auto-detect and show metadata
- **Drag-and-drop to drum pads**: Drag sample → assign to pad

### Phase 2: Smart Organization
- **Auto-tagging**: Categorize by instrument type (kick, snare, hat, bass, vocal, etc.)
- **Tempo-synced preview**: Preview loops at project BPM
- **Collections**: User-created groups for project-specific sounds
- **Recent files**: Quick access to recently used samples
- **Key/BPM filtering**: Filter samples by compatible key and tempo

### Phase 3: AI-Powered Discovery
- **Audio similarity search**: "Find similar" based on audio analysis
- **Mood/energy tags**: AI-generated mood descriptors
- **Cloud sample marketplace**: Integration with free sample sources (Freesound API)
- **Hot-swap mode**: Audition replacements while playing

---

## Sources

- [Ableton Live 12.3 — Splice Integration Announcement](https://www.ableton.com/en/live/)
- [Ableton Live 12 — Search with Sound Feature](https://www.ableton.com/en/live/whats-new/)
- [Splice: Sounds, Presets & Creative Tools for Music Makers](https://splice.com/)
- [Logic Pro Sound Library — Apple Developer](https://support.apple.com/guide/logicpro/use-the-sound-library-lgce1e9bsf6b/mac)
- [Loopcloud: Cloud-Based Sample Platform](https://www.loopcloud.com/)
- [Freesound — Collaborative Database of Creative-Commons Licensed Sounds](https://freesound.org/)

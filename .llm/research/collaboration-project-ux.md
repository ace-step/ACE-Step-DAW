# Collaboration & Project Management UX Research

**Date**: 2026-03-26
**Researcher**: Agent (Competitive Research)
**Topic**: Collaboration, project versioning, sharing, cloud sync, and AI-first workflow

---

## 1. Real-Time Collaboration

### BandLab (Industry Leader for Browser DAW Collaboration)
- Supports up to **50 simultaneous collaborators** on a single project
- **Permission model**: Owner invites collaborators with either "edit" or "view-only" access. Collaborator accepts invite, then opens project in their own Mix Editor instance
- **Auto-save**: Continuous auto-save captures every change immediately. No manual save needed. Downside: accidental deletions are also saved immediately with no easy rollback
- **Cross-device**: Seamless sync between desktop browser, iOS, and Android apps. Two producers in different countries on different devices see the same project state
- **Forking**: BandLab's version of branching. Users can "Fork" any project that allows it, creating an independent full copy in their account. Changes to the fork do not affect the original. This is analogous to Git's fork model
- **Social integration**: Projects can be shared directly to BandLab's social feed, enabling remixes and community-driven collaboration
- **Architecture**: No public documentation on CRDT vs OT implementation. Given the track-level editing granularity (not note-level), likely uses a simpler last-write-wins or operational transform approach per track rather than full CRDT

### Soundtrap (Spotify-owned, Education Focus)
- **Real-time multi-user editing**: Multiple cursors visible simultaneously, similar to Google Docs. Each collaborator's active track highlighted in real-time
- **Built-in video calling**: Integrated video chat during collaboration sessions (not just text). This is a significant differentiator for remote music creation
- **Built-in text chat**: In-session messaging for quick communication without leaving the DAW
- **Real-time feedback**: Collaborators can leave comments and suggestions directly on the project
- **Education integration**: Connects with Google Classroom, Schoology, Noteflight, MusicFirst. Teachers can assign projects, monitor student progress, and provide feedback
- **Latency issues**: Some users report synchronization problems during real-time collaboration, particularly for audio recording (MIDI collaboration is smoother)
- **Soundtrap 2.0 (March 2026)**: Major rewrite with lower latency, full effect automation, massive sample library, and improved real-time collaboration

### LANDR (Professional Collaboration)
- **DAW-to-DAW streaming**: Collaboration plugin streams audio directly from your DAW to collaborators in real-time. Producer in LA works on a mix while singer in NY listens in full fidelity and records ideas
- **HD audio video chat**: Not just basic video calling -- high-definition DAW-audio video sessions
- **Time-synced comments**: Comments tied to specific points in the timeline (similar to SoundCloud model)
- **Mobile app (2025)**: Library, Messages, Sessions (video streaming with collaborators), and Releases tabs
- **Royalty splits**: Automated royalty split management for collaborators at no added cost

### Udio (AI Platform with Collaboration)
- **Real-time co-creation**: Multiple users work on the same AI-generated track simultaneously
- **Locked ecosystem**: Songs cannot be shared outside the Udio platform as of 2026
- **Downloads temporarily disabled** during licensing transition (2025-2026)

### Ableton Link (Local Network Only)
- **Beat/tempo/phase sync** across devices on the same local network
- **No central host**: All participants are equal (unlike MIDI sync). Anyone can change tempo
- **Start/Stop sync**: Transport commands shared across all Link-enabled apps
- **Cross-platform**: Supported by Bitwig, Reason, VCV Rack, Serato DJ, and many iOS apps
- **NOT remote collaboration**: Requires local network. For remote work, Ableton recommends file sharing via WeTransfer or pCloud
- **No note/audio data**: Link syncs timing only, not musical content

---

## 2. Project Versioning & Auto-Save

### Competitor Approaches

| Feature | BandLab | Soundtrap | Splice (retired) | FL Studio | Logic Pro | Ableton |
|---|---|---|---|---|---|---|
| Auto-save | Continuous | Continuous | Per-commit | Manual | Auto-save every N minutes | Crash recovery only |
| Version history | Via Fork (copy-based) | Cloud versions | Git-like commits with diffs | Save As with naming | Alternatives (file copies) | Save As with incrementing |
| Rollback | Fork original, abandon current | Restore from cloud version | Restore any commit | Reopen old .flp file | Revert to Saved | Reopen old .als file |
| Named save points | Not supported | Not supported | Supported (commit messages) | Manual "Save new version" | "Save a Copy" | "Save a Copy" |
| Branching | Fork = independent copy | Not supported | Full branching | Not supported | Not supported | Not supported |

### Best-in-Class: Splice Studio (discontinued but instructive)
- **Git-like model**: Automatic cloud backup, change tracking per commit
- **Dependency tracking**: Tracked which samples and plugins each version used
- **Collaboration**: Shared projects with full version history visible to all collaborators
- **Shutdown reason**: Feature hadn't been maintained since 2017; quality degraded. Splice pivoted to sample marketplace
- **Lesson**: Version control for music is highly desired (community consensus on HN, KVR, Ardour forums) but hard to maintain as a business

### Community Workarounds
- Some producers use **Git** directly with Reaper (text-based project files). Branch per cue, commit per change
- **Submix/Playback**: Dedicated versioning tool that takes snapshots of DAW projects at key moments
- Desktop DAW convention: Manual "Save As" with incrementing names (song_v1.flp, song_v2.flp)

---

## 3. Stem Sharing & Export

### FL Studio Project Bones
- **Export components separately**: Automation, channel settings, plugin effects, mixer insert states, piano roll scores saved as individual files
- **Drag-and-drop transfer**: .fsc files (scores) can be dragged onto sounds in Step Sequencer. .fst files (mixer states) onto mixer inserts
- **Limitation**: MIDI notes and channel names exported separately; cannot be recombined easily
- **No audio**: Project Bones do not include audio files -- only metadata and MIDI
- **Better alternative for sharing**: Zipped Loop Package includes everything (audio + project data)

### Splice Mobile (2025)
- Record ideas on phone, export stems to DAW or share with collaborators
- Stems organized by project, tagged with tempo and key

### Ableton Live 12.3 (September 2025)
- **Built-in stem separation**: Separates audio into vocals, drums, bass, and other
- **Splice integration**: Browse and audition Splice samples within Live's Browser, synchronized to project tempo and key
- **"Search with Sound"**: Drag audio from a clip to find rhythmically and harmonically compatible samples

### AIVA
- **MIDI export**: All AI-generated compositions exportable as MIDI for editing in any DAW
- **Full copyright on Pro plan**: Users own 100% of generated content

---

## 4. Comments & Annotations

### SoundCloud Model (Reference Standard)
- **Timed comments**: Comments appear at the waveform position where the user started typing
- **Visual density indicator**: Cluster of comments at a specific time shows listener engagement hotspots
- **Hyperlinks in comments**: Can include links for credits, references, additional context
- **Hovering text boxes**: Comments appear as floating bubbles over waveform during playback
- **Single-layer limitation**: All comments on one layer. Research (ResearchGate) shows multi-layered annotation timelines would be more useful for collaborative music feedback

### LANDR
- **Time-synced comments**: Comments tied to timeline position during collaboration sessions
- **Integrated with video chat**: Can discuss while pointing at specific moments

### Soundtrap
- **In-project feedback**: Collaborators leave comments and suggestions directly on the project
- **Teacher annotations**: In education mode, teachers annotate student work at specific points

---

## 5. Templates & Presets

### Competitor Approaches
- **Ableton**: Ships with template Sets (e.g., "Default 808", "Lo-Fi Hip-Hop"). User can save any Set as template. Templates include track routing, effects, instruments
- **Logic Pro**: Templates per genre (Electronic, Hip-Hop, Songwriter, Orchestral). Each pre-configures tracks with instruments, effects, and routing
- **FL Studio**: Starter templates with pre-configured channel rack, mixer routing, and pattern structure
- **Udio**: Genre-specific templates as starting points for AI generation. Templates act as style presets
- **BandLab**: SongStarter AI generates initial ideas based on genre/mood selection

---

## 6. Cloud Sync & Storage

### BandLab
- **Unlimited cloud storage** (free tier): All projects, stems, and audio stored in cloud
- **No local-first option**: Requires internet for full functionality
- **Cross-device sync**: Automatic between all platforms

### Soundtrap
- **Cloud-native**: All projects in cloud, accessible from any device (Windows, Mac, Chromebook, iOS, Android)
- **No local storage concerns**: Everything server-side

### LANDR
- **Library tab in app**: Centralized storage for all uploaded tracks
- **Release management**: Schedule and control releases from cloud interface

---

## 7. Export, Share & Distribution

### LANDR (End-to-End Pipeline)
- **Mastering**: AI-powered, multiple styles, unlimited revisions. Plugin version for in-DAW use
- **Distribution**: Direct to 150+ streaming platforms (Spotify, Apple Music, YouTube Music)
- **Royalty management**: 100% royalties on subscription, 85% if cancelled. Automated splits
- **Pricing**: $9/single, $19/album pay-per-release; or $23.99/year unlimited
- **Reference mastering**: Upload a reference track, AI matches its sonic profile

### Suno
- **Suno Studio**: Timeline-based editor for arranging sections, adjusting transitions, fine-tuning song structure after AI generation
- **Stem editing**: Edit individual stems of AI-generated songs
- **Commercial rights**: Only while actively subscribed to paid plan

### Standard DAW Export
- WAV, MP3, FLAC, OGG formats
- Stem export (individual tracks)
- Mixdown with mastering chain applied

---

## 8. AI-First Collaboration Opportunities

### Generate-Refine-Collaborate Workflow (Novel for ACE-Step)

Based on competitor analysis, ACE-Step has a unique opportunity to define an **AI-native collaboration model**:

1. **Generate**: User creates AI stems via prompt (ACE-Step already does this)
2. **Refine**: Edit, arrange, mix the generated material (ACE-Step has this)
3. **Share**: Export stems or full project for collaborator review (partially implemented)
4. **Iterate**: Collaborator can re-generate specific stems, add their own, remix
5. **Publish**: Master and distribute (not implemented)

### What Competitors Lack
- **Suno/Udio**: Generate music but have minimal DAW editing capabilities
- **BandLab/Soundtrap**: Full DAW editing but AI generation is limited to simple features (SongStarter, AutoPitch)
- **AIVA**: Strong generation but MIDI-only output, no audio collaboration
- **ACE-Step's unique position**: AI generation + full browser DAW + collaboration potential

---

## 9. Project Organization

### Competitor Approaches
- **Ableton**: File browser with folders, recent files, Places sidebar. Collections (user-defined color-tagged folders)
- **Logic Pro**: "All Projects" browser with search, tags, and last-modified sorting
- **FL Studio**: Browser panel with categorized presets, projects, samples. User data folder for personal content
- **BandLab**: Feed-based with projects, favorites, and collections

---

## 10. ACE-Step Current State Assessment

### What ACE-Step Has
- **Local project storage**: IndexedDB via idb-keyval. Save, load, delete, list projects
- **Project archive format**: Custom .acedaw binary format with embedded audio blobs
- **Auto-save**: Debounced (1s) auto-save to IndexedDB project library
- **Undo/Redo**: Comprehensive history with scoped undo (arrangement, mixer, track levels)
- **Project templates**: ProjectTemplate type defined with save/load/list/delete in projectStorage.ts
- **Share bundle**: JSON export/import without audio (lightweight sharing)
- **Share links**: URL-based sharing with token, read-only mode, expiration
- **Collaboration store**: Zustand store with viewer mode, share dialog, collaborator list (stubbed for Phase 3)
- **Cloud storage service**: In-memory implementation with version history, shared project records, stem assets
- **Project sharing service**: Renders individual track stems as MP3, creates shared project with audio data URLs
- **Stem export**: ExportMix supports individual track rendering
- **Multiple export formats**: WAV, MP3, FLAC, OGG with metadata

### What ACE-Step Is Missing

#### P1 - Critical Gaps
1. **Real cloud backend**: cloudStorageService.ts uses in-memory Map (lost on refresh). No actual cloud persistence
2. **Auto-save version history with rollback**: Current auto-save overwrites single entry. No snapshots, no "go back to 5 minutes ago"
3. **Shareable player/embed**: Share link generates URL but requires same-origin localStorage. No hosted player page

#### P2 - Important Gaps
4. **Real-time collaboration**: collaborationStore has Collaborator type and add/remove but no WebSocket/CRDT sync. Fully stubbed
5. **Time-stamped comments/annotations**: No comment or annotation system at all
6. **Project organization (folders, tags, search)**: Project list is flat, sorted by updatedAt only. No folders, no tags, no search
7. **Distribution pipeline**: No mastering-for-streaming targets (LUFS), no integration with distribution platforms
8. **Import from other DAWs**: No MIDI file import, no stem import from standard formats

#### P3 - Nice-to-Have Gaps
9. **Forking/branching**: No way to create an independent copy of a project for experimentation
10. **In-session video/text chat**: No communication during collaboration
11. **Remix/fork from community**: No social layer for discovering and remixing others' projects
12. **Genre templates library**: ProjectTemplate type exists but no pre-built templates shipped
13. **Royalty split management**: No collaborator payment or credit tracking

---

## 11. Recommended Implementation Priority

### Phase 1: Foundation (P1)
- Implement persistent cloud storage backend (replace in-memory Maps)
- Add version history with named save points and rollback UI
- Build hosted share player page (embeddable, works without full DAW)

### Phase 2: Collaboration Core (P2)
- MIDI file import/export (standard .mid format)
- Project organization (folders, tags, search, favorites)
- Time-stamped comments on timeline
- Mastering for streaming targets (Spotify -14 LUFS, Apple -16 LUFS)

### Phase 3: Real-Time & Social (P2-P3)
- WebSocket-based real-time collaboration (start with cursor visibility + track locking)
- Project forking/branching
- Genre template library (ship 5-10 built-in templates)
- In-session text chat

### Phase 4: Platform (P3)
- Community sharing/remix feed
- Distribution integration (DistroKid/LANDR API)
- Royalty split management
- Video chat integration

---

## Sources

- [BandLab Collaboration Features: Complete Guide (2026)](https://www.audeobox.com/learn/bandlab/bandlab-collaboration-features/)
- [From DAW to GAW: How BandLab Studio Is Using AI](https://www.makingascene.org/from-daw-to-gaw-how-bandlab-studio-is-using-ai-to-redefine-music-production/)
- [The New Soundtrap: All The Power, None Of The Friction](https://blog.soundtrap.com/new-soundtrap/)
- [Soundtrap Software 2025](https://www.spotsaas.com/blog/soundtrap-software/)
- [Splice Studio is free backup, version control, and collaboration for your DAW](https://cdm.link/splice-studio-is-free-backup-version-control-and-collaboration-for-your-daw/)
- [Ableton Live 12.3: Stem Separation, Splice Integration](https://routenote.com/blog/ableton-live-12-3-update/)
- [Ableton Link features and functions FAQ](https://help.ableton.com/hc/en-us/articles/209776125-Link-features-and-functions-FAQ)
- [Best Practices for Collaborating Remotely - Ableton](https://help.ableton.com/hc/en-us/articles/360012680119-Best-Practices-for-Collaborating-Remotely)
- [How to Use Project Bones in FL Studio](https://itsgratuitous.com/how-to-use-project-bones-in-fl-studio/)
- [Best AI Music Generators in 2026: Suno vs Udio vs AIVA](https://superprompt.com/blog/best-ai-music-generators)
- [LANDR Review (2026)](https://aiquiks.com/ai-tools/landr)
- [LANDR launches new app with AI mastering, collaboration and distribution](https://djmag.com/tech/landr-launches-new-app-ai-mastering-collaboration-and-unlimited-distribution-one)
- [Suno vs AIVA: Best AI Tool for Music Creation](https://www.musicful.ai/vs/suno-vs-aiva/)
- [Best AI Music Generators in 2026: Suno vs Udio vs ElevenLabs](https://jam.com/resources/best-ai-music-generators-2026)

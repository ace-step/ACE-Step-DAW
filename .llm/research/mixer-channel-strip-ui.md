# Mixer & Channel Strip UI Research

> Date: 2026-03-27 | Scope: Mixer UI design in mainstream DAWs vs ACE-Step

---

## 1. Ableton Live Mixer

### Session View Mixer
- **Integrated fader+meter**: Meter is part of the fader track (green=RMS, dark green=peak)
- **Adjustable fader height**: Can resize but limited range
- **Fader scale issue**: Half the fader = -24dB (not great for gain staging)
- **Sends**: Unlabeled in Arrangement view — must count to know which is which
- **Track colors**: Added at bottom of channels in expanded view for navigation
- **Pan**: Actually a stereo balance control (true pan on mono tracks only)
- **Constant power panning**: Sinusoidal gain curves, +3dB at hard L/R

### Ableton Device View (Effects)
- **Horizontal chain**: Devices displayed left-to-right at bottom of screen
- **No insert slots**: Effects go in Device View, not channel strip
- **Drag-to-add**: From browser to Device View
- **Racks**: Group devices into Audio Effect Rack for parallel processing

### Redesign Case Study (Nenad Milosevic, 2025)
- Proposed enhanced stereo controls: Pan, Balance, and Stereo Width per channel
- Simplified I/O: 3 elements instead of 4 dropdowns + 3 buttons
- Contextual preset browsing closer to each device
- Community wanted: mini plugin visualization in mixer (like Studio One)

## 2. Logic Pro Channel Strip
- **Vertical insert list**: Click slot → select plugin from categorized menu
- **Pre/post fader toggle** per send
- **I/O section**: Input source, output bus, clear routing display
- **Channel EQ**: Built-in EQ per channel with visual curve
- **Compressor**: Built-in per channel with gain reduction meter
- **Smart Controls**: 8 macro knobs mapped to most important parameters

## 3. Pro Tools Mix Window
- **10 insert slots**: Drag to reorder, bypass per slot
- **10 send slots**: Pre/post fader, pan per send
- **Playlists**: Per-track take management
- **VCA faders**: Group control without summing
- **Solo-safe**: Ctrl+click solo button
- **Detailed I/O**: Input, output, bus, and side-chain routing per channel

## 4. FL Studio Mixer
- **100 mixer tracks**: Numbered, with routing matrix
- **Visual routing**: Lines showing signal flow between tracks
- **10 effect slots per track**: Clear numbered list
- **Separation display**: Audio routing visualized as colored lines
- **Sidechain**: Direct routing between any mixer tracks

## 5. Web DAW Mixers
- **BandLab**: Simplified mixer with fader + pan per track, no insert slots
- **Soundtrap**: Basic volume/pan only
- **Amped Studio**: More complete — fader, pan, mute/solo, effect inserts

## 6. ACE-Step Current State

### What Exists
- MixerPanel with ChannelStrip per track (min 132px width)
- VerticalFader (96px min height) with keyboard support
- Pan knob, 3-band EQ knobs, compressor toggle + threshold/ratio
- Insert section (max 4 effects)
- Send section (max 2 returns)
- LevelMeter with animated height (75ms transition)
- Solo, Mute buttons
- role="group", aria-label, tabindex for keyboard nav

### Key Gaps vs Competitors
| Feature | Competitors | ACE-Step |
|---|---|---|
| Peak + RMS dual metering | All major DAWs | Peak only |
| dB scale markings | All | None |
| 10+ insert slots | Pro Tools, FL | Max 4 |
| Pre/post fader sends | All | No toggle |
| Solo-safe | All | No |
| Visual routing | FL Studio | No |
| VCA/group faders | Pro Tools, Logic | No |
| Channel EQ curve display | Logic, Ableton | Knobs only |

---

## 7. Recommendations for ACE-Step

1. **Add RMS metering** alongside peak (light green = RMS, dark = peak, like Ableton)
2. **dB scale markings** on fader track (-inf, -48, -24, -12, -6, -3, 0, +6)
3. **Increase insert slots** to 8 (expandable)
4. **Pre/post fader send toggle** (click label to switch)
5. **Solo-safe mode** (right-click solo → "Solo Safe")
6. **Mini EQ curve** display on channel strip (visualize 3-band settings)
7. **Gain reduction meter** on compressor section

---

## Sources

- [Ableton Live Redesign Case Study](https://nenadmilosevic.co/ableton-live-redesign/)
- [Mixing Music in Ableton Live: An Overview](https://www.admiralbumblebee.com/music/2019/04/27/Mixing-music-in-Live.html)
- [Mix Tech Series Part 1: Levels & Panning](https://abletunes.com/blog/mix-tech-series-part-1-levels-panning/)
- [Ableton Live 12 Interface](https://www.ableton.com/en/live/learn-live/interface/)

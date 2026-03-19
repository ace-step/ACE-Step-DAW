import type { ShortcutPreset, ShortcutMap } from '../types/shortcuts';

/**
 * DAW migration presets — each provides a partial ShortcutMap
 * that overrides only the shortcuts that differ from the ACE-Step defaults.
 * Actions not listed keep their default binding.
 */

const abletonMap: ShortcutMap = {
  // Ableton Live-style bindings
  'transport.playPause':  { code: 'Space' },
  'transport.stop':       { code: 'Space' },           // Ableton: space toggles, no separate stop
  'transport.loop':       { code: 'KeyL', mod: true },  // Ctrl/Cmd+L in Ableton
  'transport.record':     { code: 'F9' },               // F9 = record in Ableton
  'transport.nudgeLeft':  { code: 'ArrowLeft' },
  'transport.nudgeRight': { code: 'ArrowRight' },
  'clips.delete':         { code: 'Delete' },
  'clips.duplicate':      { code: 'KeyD', mod: true },
  'clips.split':          { code: 'KeyE', mod: true },  // Cmd+E = split in Ableton
  'clips.selectAll':      { code: 'KeyA', mod: true },
  'view.zoomIn':          { code: 'Equal', mod: true },
  'view.zoomOut':         { code: 'Minus', mod: true },
  'view.zoomToSelection': { code: 'KeyZ' },
  'view.toggleSnap':      { code: 'KeyB', mod: true },  // Cmd+B = snap in Ableton
  'tracks.mute':          { code: 'Digit0' },            // 0 disables/activates selection in Ableton
  'panels.mixer':         { code: 'KeyM', mod: true },  // Cmd+M = mixer in Ableton
  'panels.library':       { code: 'KeyL', mod: true, alt: true }, // Cmd+Alt+L
  'panels.loopBrowser':   { code: 'Tab' },
  'project.new':          { code: 'KeyN', mod: true },
  'project.export':       { code: 'KeyE', mod: true, shift: true },
  'project.bounceInPlace': { code: 'KeyR', mod: true, shift: true },
  'project.settings':     { code: 'Comma', mod: true },
};

const logicProMap: ShortcutMap = {
  // Logic Pro-style bindings
  'transport.playPause':    { code: 'Space' },
  'transport.stop':         { code: 'Digit0' },           // 0 on numpad = stop in Logic
  'transport.loop':         { code: 'KeyC' },              // C = cycle (loop) in Logic
  'transport.metronome':    { code: 'KeyK' },
  'transport.record':       { code: 'KeyR' },
  'transport.home':         { code: 'Home' },
  'clips.delete':           { code: 'Backspace' },
  'clips.duplicate':        { code: 'KeyD', mod: true },
  'clips.split':            { code: 'KeyT', mod: true },  // Cmd+T = split in Logic
  'clips.selectAll':        { code: 'KeyA', mod: true },
  'clips.edit':             { code: 'KeyE' },
  'view.zoomIn':            { code: 'Equal', mod: true },
  'view.zoomOut':           { code: 'Minus', mod: true },
  'view.zoomToSelection':   { code: 'KeyZ' },
  'view.zoomToFit':         { code: 'KeyZ' },
  'view.toggleSnap':        { code: 'KeyN' },
  'tracks.mute':            { code: 'KeyM' },
  'tracks.solo':            { code: 'KeyS' },
  'panels.mixer':           { code: 'KeyX' },
  'panels.smartControls':   { code: 'KeyB' },
  'panels.library':         { code: 'KeyY' },
  'panels.loopBrowser':     { code: 'KeyO' },
  'project.new':            { code: 'KeyN', mod: true },
  'project.settings':       { code: 'Comma', mod: true },
  'project.export':         { code: 'KeyE', mod: true },  // Cmd+E = bounce in Logic
  'project.bounceInPlace':  { code: 'KeyB', mod: true },
};

const flStudioMap: ShortcutMap = {
  // FL Studio-style bindings
  'transport.playPause':    { code: 'Space' },
  'transport.stop':         { code: 'Space', mod: true },  // Ctrl+Space = stop in FL
  'transport.loop':         { code: 'KeyL', mod: true },
  'transport.metronome':    { code: 'KeyM', mod: true },   // Ctrl+M = metronome in FL
  'transport.record':       { code: 'KeyR', mod: true },   // Ctrl+R = record mode in FL
  'clips.delete':           { code: 'Delete' },
  'clips.duplicate':        { code: 'KeyB', mod: true },   // Ctrl+B = duplicate in FL
  'clips.split':            { code: 'KeyS', mod: true, shift: true },
  'clips.selectAll':        { code: 'KeyA', mod: true },
  'tracks.mute':            { code: 'KeyM' },
  'tracks.solo':            { code: 'KeyS' },
  'view.zoomIn':            { code: 'Equal', mod: true },
  'view.zoomOut':           { code: 'Minus', mod: true },
  'view.zoomToSelection':   { code: 'KeyZ' },
  'view.toggleSnap':        { code: 'KeyS', alt: true },   // Alt+S in FL
  'panels.mixer':           { code: 'F9' },                // F9 = mixer in FL
  'panels.library':         { code: 'F8' },                // F8 = plugin picker in FL
  'panels.loopBrowser':     { code: 'KeyO' },
  'project.new':            { code: 'KeyN', mod: true },
  'project.export':         { code: 'KeyR', mod: true, shift: true },
  'project.bounceInPlace':  { code: 'KeyB', mod: true, alt: true },
  'project.settings':       { code: 'F11' },
};

const proToolsMap: ShortcutMap = {
  // Pro Tools-style bindings
  'transport.playPause':    { code: 'Space' },
  'transport.stop':         { code: 'Space' },              // Same key stops in Pro Tools
  'transport.loop':         { code: 'Digit4', mod: true },  // Cmd+4 in Pro Tools (numpad)
  'transport.metronome':    { code: 'Digit7' },             // 7 on numpad = click
  'transport.record':       { code: 'F12' },                // F12 = record in Pro Tools
  'transport.home':         { code: 'Enter' },              // Return = go to start in Pro Tools
  'clips.delete':           { code: 'Delete' },
  'clips.duplicate':        { code: 'KeyD', mod: true },
  'clips.split':            { code: 'KeyB' },               // B = separate clip in Pro Tools
  'clips.selectAll':        { code: 'KeyA', mod: true },
  'tracks.mute':            { code: 'KeyM' },
  'tracks.solo':            { code: 'KeyS' },
  'view.zoomIn':            { code: 'KeyT' },               // T = zoom in on Pro Tools
  'view.zoomOut':           { code: 'KeyR' },               // R = zoom out on Pro Tools
  'view.zoomToSelection':   { code: 'KeyZ' },
  'view.zoomToFit':         { code: 'KeyA', alt: true },    // Alt+A = zoom to fit in Pro Tools
  'view.toggleSnap':        { code: 'KeyN' },
  'panels.mixer':           { code: 'Equal', mod: true },   // Cmd+= = mix window in PT
  'panels.loopBrowser':     { code: 'KeyO' },
  'project.new':            { code: 'KeyN', mod: true },
  'project.export':         { code: 'KeyB', mod: true, shift: true, alt: true },
  'project.bounceInPlace':  { code: 'KeyR', mod: true, shift: true },
  'project.settings':       { code: 'Comma', mod: true },
};

export const SHORTCUT_PRESETS: ShortcutPreset[] = [
  {
    id: 'ace-step',
    name: 'ACE-Step (Default)',
    description: 'Default ACE-Step DAW shortcuts',
    map: {},  // Empty = all defaults
  },
  {
    id: 'ableton-live',
    name: 'Ableton Live',
    description: 'Shortcuts inspired by Ableton Live',
    map: abletonMap,
  },
  {
    id: 'logic-pro',
    name: 'Logic Pro',
    description: 'Shortcuts inspired by Logic Pro',
    map: logicProMap,
  },
  {
    id: 'fl-studio',
    name: 'FL Studio',
    description: 'Shortcuts inspired by FL Studio',
    map: flStudioMap,
  },
  {
    id: 'pro-tools',
    name: 'Pro Tools',
    description: 'Shortcuts inspired by Pro Tools',
    map: proToolsMap,
  },
];

export const SHORTCUT_PRESET_MAP: Record<string, ShortcutPreset> = Object.fromEntries(
  SHORTCUT_PRESETS.map((p) => [p.id, p]),
);

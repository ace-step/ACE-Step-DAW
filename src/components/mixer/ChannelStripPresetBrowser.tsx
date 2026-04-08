import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  loadPresetLibrary,
  removePresetFromLibrary,
  renamePreset,
  duplicatePreset,
  exportPresetsToJSON,
  importPresetsFromJSON,
  addPresetToLibrary,
} from '../../services/channelStripPresetService';
import type { ChannelStripPreset, ChannelStripPresetCategory } from '../../types/project';

const CATEGORY_LABELS: Record<ChannelStripPresetCategory, string> = {
  vocal: 'Vocal',
  drums: 'Drums',
  bass: 'Bass',
  guitar: 'Guitar',
  keys: 'Keys',
  synth: 'Synth',
  strings: 'Strings',
  fx: 'FX',
  master: 'Master',
  custom: 'Custom',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as ChannelStripPresetCategory[];

interface ChannelStripPresetBrowserProps {
  trackId: string;
  onClose: () => void;
}

export const ChannelStripPresetBrowser = React.memo(function ChannelStripPresetBrowser({
  trackId,
  onClose,
}: ChannelStripPresetBrowserProps) {
  const applyChannelStripPreset = useProjectStore((s) => s.applyChannelStripPreset);
  const saveChannelStripPreset = useProjectStore((s) => s.saveChannelStripPreset);

  const [presets, setPresets] = useState<ChannelStripPreset[]>(() => loadPresetLibrary());
  const [filterCategory, setFilterCategory] = useState<ChannelStripPresetCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState<ChannelStripPresetCategory>('custom');
  const [saveDescription, setSaveDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSave && saveNameRef.current) saveNameRef.current.focus();
  }, [showSave]);

  const refreshPresets = useCallback(() => setPresets(loadPresetLibrary()), []);

  const filtered = useMemo(() => {
    let result = presets;
    if (filterCategory !== 'all') {
      result = result.filter((p) => p.category === filterCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [presets, filterCategory, search]);

  const handleApply = useCallback(
    (presetId: string) => {
      applyChannelStripPreset(trackId, presetId);
      onClose();
    },
    [applyChannelStripPreset, trackId, onClose],
  );

  const handleSave = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    saveChannelStripPreset(trackId, trimmed, saveCategory, saveDescription.trim());
    setSaveName('');
    setSaveDescription('');
    setShowSave(false);
    refreshPresets();
  }, [saveName, saveCategory, saveDescription, trackId, saveChannelStripPreset, refreshPresets]);

  const handleDelete = useCallback(
    (presetId: string) => {
      removePresetFromLibrary(presetId);
      refreshPresets();
    },
    [refreshPresets],
  );

  const handleDuplicate = useCallback(
    (presetId: string) => {
      duplicatePreset(presetId);
      refreshPresets();
    },
    [refreshPresets],
  );

  const handleRenameCommit = useCallback(
    (presetId: string) => {
      const trimmed = editName.trim();
      if (trimmed) {
        renamePreset(presetId, trimmed);
        refreshPresets();
      }
      setEditingId(null);
    },
    [editName, refreshPresets],
  );

  const handleExport = useCallback(() => {
    const json = exportPresetsToJSON(presets);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'channel-strip-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [presets]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = importPresetsFromJSON(reader.result as string);
          imported.forEach((p) => addPresetToLibrary(p));
          refreshPresets();
        } catch {
          // invalid file — silently ignore
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [refreshPresets]);

  return (
    <div
      data-testid="channel-strip-preset-browser"
      className="absolute left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-[#444] bg-[#1e1e1e]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-300">Channel Presets</span>
        <div className="flex items-center gap-1">
          <button
            data-testid="preset-import-btn"
            onClick={handleImport}
            title="Import presets from JSON"
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-[#333] hover:text-zinc-300 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v6M2 4l3 3 3-3M1 9h8" /></svg>
          </button>
          <button
            data-testid="preset-export-btn"
            onClick={handleExport}
            title="Export user presets to JSON"
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-[#333] hover:text-zinc-300 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 7V1M2 4l3-3 3 3M1 9h8" /></svg>
          </button>
          <button
            data-testid="preset-browser-close"
            onClick={onClose}
            title="Close preset browser"
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-[#333] hover:text-zinc-300 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          ref={searchRef}
          data-testid="preset-search"
          type="text"
          placeholder="Search presets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded bg-[#2a2a2a] border border-[#3a3a3a] px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-daw-accent"
        />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        <button
          data-testid="preset-cat-all"
          onClick={() => setFilterCategory('all')}
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase transition-colors ${
            filterCategory === 'all'
              ? 'bg-daw-accent text-black'
              : 'bg-[#333] text-zinc-500 hover:bg-[#3a3a3a] hover:text-zinc-300'
          }`}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            data-testid={`preset-cat-${cat}`}
            onClick={() => setFilterCategory(cat === filterCategory ? 'all' : cat)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase transition-colors ${
              filterCategory === cat
                ? 'bg-daw-accent text-black'
                : 'bg-[#333] text-zinc-500 hover:bg-[#3a3a3a] hover:text-zinc-300'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Save New Preset */}
      {showSave ? (
        <div data-testid="preset-save-form" className="border-y border-[#333] bg-[#252525] px-3 py-2 flex flex-col gap-1.5">
          <input
            ref={saveNameRef}
            data-testid="preset-save-name"
            type="text"
            placeholder="Preset name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false); }}
            className="w-full rounded bg-[#2a2a2a] border border-[#3a3a3a] px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-daw-accent"
            maxLength={64}
          />
          <select
            data-testid="preset-save-category"
            value={saveCategory}
            onChange={(e) => setSaveCategory(e.target.value as ChannelStripPresetCategory)}
            className="w-full rounded bg-[#2a2a2a] border border-[#3a3a3a] px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-daw-accent"
          >
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <input
            data-testid="preset-save-description"
            type="text"
            placeholder="Description (optional)"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false); }}
            className="w-full rounded bg-[#2a2a2a] border border-[#3a3a3a] px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-daw-accent"
            maxLength={128}
          />
          <div className="flex gap-1">
            <button
              data-testid="preset-save-confirm"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="flex-1 rounded bg-daw-accent px-2 py-1 text-[10px] font-semibold text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Save
            </button>
            <button
              data-testid="preset-save-cancel"
              onClick={() => setShowSave(false)}
              className="flex-1 rounded bg-[#333] px-2 py-1 text-[10px] text-zinc-400 hover:bg-[#3a3a3a] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-2">
          <button
            data-testid="preset-save-btn"
            onClick={() => setShowSave(true)}
            className="w-full rounded bg-[#333] px-2 py-1.5 text-[10px] font-medium text-zinc-400 hover:bg-[#3a3a3a] hover:text-zinc-200 transition-colors"
          >
            + Save Current Channel Strip
          </button>
        </div>
      )}

      {/* Preset list */}
      <div data-testid="preset-list" className="flex-1 overflow-y-auto px-3 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center text-[11px] text-zinc-600 py-4">No presets found</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((preset) => (
              <div
                key={preset.id}
                data-testid={`preset-item-${preset.id}`}
                className="group flex items-center gap-1 rounded px-2 py-1.5 text-[11px] hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                onClick={() => handleApply(preset.id)}
                title={preset.description || preset.name}
              >
                <div className="flex-1 min-w-0">
                  {editingId === preset.id ? (
                    <input
                      data-testid="preset-rename-input"
                      className="w-full bg-[#333] border border-daw-accent rounded px-1 py-0.5 text-[11px] text-zinc-100 outline-none"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleRenameCommit(preset.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCommit(preset.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      maxLength={64}
                    />
                  ) : (
                    <>
                      <div className="truncate text-zinc-300">{preset.name}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] uppercase text-zinc-600">{CATEGORY_LABELS[preset.category]}</span>
                        {preset.isFactory && <span className="text-[8px] bg-[#333] text-zinc-500 rounded px-1">Built-in</span>}
                      </div>
                    </>
                  )}
                </div>
                {editingId !== preset.id && (
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      data-testid={`preset-duplicate-${preset.id}`}
                      title="Duplicate preset"
                      className="flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-[#444] hover:text-zinc-300"
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(preset.id); }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="2" width="5" height="5" rx="0.5" /><path d="M1 5.5V1.5C1 1.2 1.2 1 1.5 1H5.5" /></svg>
                    </button>
                    {!preset.isFactory && (
                      <>
                        <button
                          data-testid={`preset-rename-${preset.id}`}
                          title="Rename preset"
                          className="flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-[#444] hover:text-zinc-300"
                          onClick={(e) => { e.stopPropagation(); setEditingId(preset.id); setEditName(preset.name); }}
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M5.5 1.5l1 1L3 6H2V5l3.5-3.5z" /></svg>
                        </button>
                        <button
                          data-testid={`preset-delete-${preset.id}`}
                          title="Delete preset"
                          className="flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                          onClick={(e) => { e.stopPropagation(); handleDelete(preset.id); }}
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

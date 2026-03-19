import { useUIStore } from '../../store/uiStore';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useProjectStore } from '../../store/projectStore';

export function AddTrackButton() {
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const { openFilePicker } = useAudioImport();
  const createGroupTrack = useProjectStore((s) => s.createGroupTrack);

  return (
    <div className="flex gap-1 mx-2 my-2">
      <button
        onClick={() => setShowInstrumentPicker(true)}
        className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] font-medium text-zinc-400 hover:text-white bg-[#3a3a3a] hover:bg-[#484848] rounded transition-colors"
      >
        <span className="text-sm">+</span> Track
      </button>
      <button
        onClick={() => createGroupTrack()}
        className="flex items-center justify-center gap-1 h-7 px-2 text-[11px] font-medium text-zinc-400 hover:text-white bg-[#3a3a3a] hover:bg-[#484848] rounded transition-colors"
        title="Add group / folder track"
        aria-label="Add group track"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4.5V13a1 1 0 001 1h12a1 1 0 001-1V5.5a1 1 0 00-1-1H7.5L6 3H2a1 1 0 00-1 1.5z" />
          <path d="M8 8v4M6 10h4" />
        </svg>
      </button>
      <button
        onClick={openFilePicker}
        className="flex items-center justify-center gap-1 h-7 px-2 text-[11px] font-medium text-zinc-400 hover:text-white bg-[#3a3a3a] hover:bg-[#484848] rounded transition-colors"
        title="Import audio file"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M6 1v7M3 5l3 3 3-3" />
          <path d="M1 9v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V9" />
        </svg>
      </button>
    </div>
  );
}

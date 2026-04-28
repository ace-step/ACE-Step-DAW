import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';

interface SelectionFloatingToolbarProps {
  /** Left edge of the selection in pixels (absolute within trackArea) */
  selLeft: number | null;
  /** Width of the selection in pixels */
  selWidth: number | null;
  /** Bottom edge of the selection in pixels (absolute within trackArea) */
  selBottom: number | null;
}

/**
 * Floating pill toolbar that appears below a committed selectWindow.
 * Provides quick actions: Music Enhancer, Add Layer, + MIDI, and arrangement operations.
 */
export function SelectionFloatingToolbar({ selLeft, selWidth, selBottom }: SelectionFloatingToolbarProps) {
  const selectWindow = useUIStore((s) => s.selectWindow);
  const setSelectWindow = useUIStore((s) => s.setSelectWindow);
  const openEnhancerFromSelection = useUIStore((s) => s.openEnhancerFromSelection);
  const setAddLayerOpen = useUIStore((s) => s.setAddLayerOpen);
  const ensureMidiClip = useProjectStore((s) => s.ensureMidiClip);
  const insertTime = useProjectStore((s) => s.insertTime);
  const deleteTimeRange = useProjectStore((s) => s.deleteTimeRange);
  const duplicateTimeRange = useProjectStore((s) => s.duplicateTimeRange);

  if (!selectWindow || selLeft === null || selWidth === null || selBottom === null) {
    return null;
  }

  const centerX = selLeft + selWidth / 2;
  const topY = selBottom + 8;

  const handleMusicEnhancer = () => {
    openEnhancerFromSelection();
  };

  const handleAddLayer = () => {
    setAddLayerOpen(true);
  };

  const handleAddMidi = () => {
    const duration = selectWindow.endTime - selectWindow.startTime;
    for (const trackId of selectWindow.trackIds) {
      ensureMidiClip(trackId, selectWindow.startTime, duration);
    }
  };

  const handleInsertTime = () => {
    insertTime(selectWindow.startTime, selectWindow.endTime - selectWindow.startTime);
    setSelectWindow(null);
  };

  const handleDeleteTime = () => {
    deleteTimeRange(selectWindow.startTime, selectWindow.endTime);
    setSelectWindow(null);
  };

  const handleDuplicateSection = () => {
    duplicateTimeRange(selectWindow.startTime, selectWindow.endTime);
    setSelectWindow(null);
  };

  const btnClass = "flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors";
  const divider = <div className="w-px h-5 bg-zinc-600/50" />;

  return (
    <div
      data-testid="selection-floating-toolbar"
      className="absolute flex items-center gap-1 px-2 py-1.5 rounded-full border border-[#444] bg-[#2a2a2a]/95 backdrop-blur-sm shadow-lg transition-opacity duration-150 pointer-events-auto"
      style={{
        left: centerX,
        top: topY,
        transform: 'translateX(-50%)',
        zIndex: Z.overlay,
      }}
    >
      {/* Enhance */}
      <button type="button" aria-label="Enhance" className={btnClass} onClick={handleMusicEnhancer}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v14M6 7l4-4 4 4M6 13l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Add Layer */}
      <button type="button" aria-label="Add Layer" className={btnClass} onClick={handleAddLayer}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3L5 11h4l-1 6 6-8h-4l1-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* + MIDI */}
      <button
        type="button"
        aria-label="+ MIDI"
        className="flex items-center justify-center h-8 px-2.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-xs font-medium whitespace-nowrap"
        onClick={handleAddMidi}
      >
        + MIDI
      </button>

      {divider}

      {/* Insert Time */}
      <button type="button" aria-label="Insert Time" title="Insert Time" className={btnClass} onClick={handleInsertTime}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v12M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Delete Time (Ripple Delete) */}
      <button type="button" aria-label="Delete Time" title="Delete Time (Ripple Delete)" className={btnClass} onClick={handleDeleteTime}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Duplicate Section */}
      <button type="button" aria-label="Duplicate Section" title="Duplicate Section" className={btnClass} onClick={handleDuplicateSection}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="6" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
    </div>
  );
}

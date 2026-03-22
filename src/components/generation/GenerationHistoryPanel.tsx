import { useGenerationStore } from '../../store/generationStore';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import { GenerationHistorySection } from './GenerationHistorySection';

export function GenerationHistoryPanel() {
  const showGenerationPanel = useUIStore((state) => state.showGenerationPanel);
  const generationPanelView = useUIStore((state) => state.generationPanelView);
  const setShow = useUIStore((state) => state.setShowGenerationHistoryPanel);
  const stopGenerationHistoryPreview = useGenerationStore((state) => state.stopGenerationHistoryPreview);
  const show = showGenerationPanel && generationPanelView === 'history';

  if (!show) return null;

  return (
    <aside
      className="fixed right-4 top-14 bottom-8 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#14161d]/95 shadow-2xl backdrop-blur"
      style={{ zIndex: Z.commandPalette }}
      aria-label="Generation history panel"
    >
      <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">Generation History</h2>
          <p className="text-[11px] text-zinc-400">Browse, audition, and drag past AI results back into the arrangement.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopGenerationHistoryPreview();
            setShow(false);
          }}
          className="ml-auto text-lg leading-none text-zinc-400 transition-colors hover:text-zinc-200"
          aria-label="Close generation history panel"
        >
          &times;
        </button>
      </div>

      <GenerationHistorySection />
    </aside>
  );
}

import type { LmModelEntry, ModelEntry } from '../../types/api';

interface ModelInventorySectionProps {
  availableModels: ModelEntry[];
  availableLmModels: LmModelEntry[];
  model: string;
  selectedLmModel: string;
  onSelectModel: (modelName: string) => void;
  onSelectLmModel: (modelName: string) => void;
}

export function ModelInventorySection({
  availableModels,
  availableLmModels,
  model,
  selectedLmModel,
  onSelectModel,
  onSelectLmModel,
}: ModelInventorySectionProps) {
  if (availableModels.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-zinc-300 pt-2">Custom Models</h3>
      <div className="bg-[#1a1a1a] rounded border border-daw-border max-h-[140px] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-daw-border text-zinc-400">
              <th className="text-left px-2 py-1.5 font-medium">DiT Model</th>
              <th className="text-center px-2 py-1.5 font-medium w-16">Default</th>
              <th className="text-center px-2 py-1.5 font-medium w-16">Loaded</th>
            </tr>
          </thead>
          <tbody>
            {availableModels.map((entry) => (
              <tr
                key={entry.name}
                onClick={() => onSelectModel(entry.name)}
                className={`border-b border-[#2a2a2a] cursor-pointer transition-colors ${
                  entry.name === model ? 'bg-daw-accent/15' : 'hover:bg-[#252525]'
                }`}
              >
                <td className="px-2 py-1.5 text-zinc-200 truncate max-w-[200px]">
                  {entry.name}
                  {entry.name === model && (
                    <span className="ml-1.5 text-[8px] text-daw-accent font-bold uppercase">selected</span>
                  )}
                </td>
                <td className="text-center px-2 py-1.5">
                  {entry.is_default ? <span className="text-emerald-400">Yes</span> : <span className="text-zinc-600">-</span>}
                </td>
                <td className="text-center px-2 py-1.5">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${entry.is_loaded ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {availableLmModels.length > 0 ? (
        <div className="bg-[#1a1a1a] rounded border border-daw-border max-h-[100px] overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-daw-border text-zinc-400">
                <th className="text-left px-2 py-1.5 font-medium">LM Model</th>
                <th className="text-center px-2 py-1.5 font-medium w-16">Loaded</th>
              </tr>
            </thead>
            <tbody>
              {availableLmModels.map((entry) => (
                <tr
                  key={entry.name}
                  onClick={() => onSelectLmModel(entry.name)}
                  className={`border-b border-[#2a2a2a] cursor-pointer transition-colors ${
                    entry.name === selectedLmModel ? 'bg-daw-accent/15' : 'hover:bg-[#252525]'
                  }`}
                >
                  <td className="px-2 py-1.5 text-zinc-200 truncate max-w-[240px]">
                    {entry.name}
                    {entry.name === selectedLmModel ? (
                      <span className="ml-1.5 text-[8px] text-daw-accent font-bold uppercase">selected</span>
                    ) : null}
                  </td>
                  <td className="text-center px-2 py-1.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${entry.is_loaded ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[10px] text-zinc-600">Click a row to select it. Selection is saved with project settings.</p>
    </section>
  );
}

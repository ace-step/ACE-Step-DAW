import { get, set } from 'idb-keyval';
import type { GenerationHistoryRecord } from '../store/generationStore';

const GENERATION_HISTORY_KEY = 'generation-history:records';
export const MAX_GENERATION_HISTORY_RECORDS = 200;

function normalizeGenerationHistory(records: GenerationHistoryRecord[]): GenerationHistoryRecord[] {
  return [...records]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_GENERATION_HISTORY_RECORDS);
}

export async function loadGenerationHistoryRecords(): Promise<GenerationHistoryRecord[]> {
  try {
    const data = await get<string>(GENERATION_HISTORY_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as GenerationHistoryRecord[];
    return Array.isArray(parsed) ? normalizeGenerationHistory(parsed) : [];
  } catch {
    return [];
  }
}

export async function saveGenerationHistoryRecords(records: GenerationHistoryRecord[]): Promise<void> {
  try {
    await set(GENERATION_HISTORY_KEY, JSON.stringify(normalizeGenerationHistory(records)));
  } catch {
    // Ignore persistence failures so the in-memory store keeps working.
  }
}

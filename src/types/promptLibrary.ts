export interface SavedPrompt {
  id: string;
  prompt: string;
  title: string;
  tags: string[];
  category: string;
  isFavorite: boolean;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  metadata: SavedPromptMetadata;
}

export interface SavedPromptMetadata {
  bpm?: number;
  keyScale?: string;
  genre?: string;
  mood?: string;
  styleTags?: string[];
  lengthSeconds?: number;
}

export type PromptLibrarySortKey = 'recent' | 'mostUsed' | 'alphabetical' | 'dateCreated';

export interface PromptLibraryFilter {
  search?: string;
  tags?: string[];
  category?: string;
  favoritesOnly?: boolean;
}

export interface PromptLibraryExport {
  version: 1;
  exportedAt: number;
  prompts: SavedPrompt[];
}

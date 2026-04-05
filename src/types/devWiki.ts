/**
 * Development Knowledge Wiki types — structured competitive research & architecture decisions.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1455
 */

export interface DevWikiEntry {
  id: string;
  category: DevWikiCategory;
  title: string;
  content: string;
  source?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type DevWikiCategory =
  | 'competitor'
  | 'architecture'
  | 'feature'
  | 'user-feedback'
  | 'decision';

export interface DevWikiQuery {
  category?: DevWikiCategory;
  tags?: string[];
  search?: string;
}

export interface DevWikiIndex {
  entries: DevWikiEntry[];
  lastUpdated: number;
  version: number;
}

export const DEV_WIKI_VERSION = 1;

export const DEV_WIKI_CATEGORIES: DevWikiCategory[] = [
  'competitor',
  'architecture',
  'feature',
  'user-feedback',
  'decision',
];

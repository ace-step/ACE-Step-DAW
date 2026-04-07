/**
 * WAMCatalog — Curated list of known WAM 2.0 plugins.
 *
 * Provides a built-in discovery mechanism for WAM plugins.
 * Users can also load plugins from custom URLs.
 */
import type { WAMCatalogEntry } from '../../types/wam';

/**
 * Curated WAM plugin catalog.
 * These are well-known, tested WAM plugins from the community.
 *
 * Note: URLs point to the plugin's ES module entry point.
 * Plugins are loaded on-demand when the user selects them.
 */
export const WAM_CATALOG: WAMCatalogEntry[] = [
  {
    id: 'wam-pingpongdelay',
    name: 'Ping Pong Delay',
    vendor: 'WAM Team',
    description: 'Stereo ping-pong delay effect with feedback and mix controls',
    category: 'effect',
    subcategory: 'delay',
    url: 'https://mainline.i3s.unice.fr/wam2/packages/pingpongdelay/index.js',
    tags: ['delay', 'stereo', 'feedback'],
  },
  {
    id: 'wam-obxd',
    name: 'OB-Xd',
    vendor: 'WAM Team',
    description: 'Virtual analog synthesizer based on the Oberheim OB-X',
    category: 'instrument',
    subcategory: 'synth',
    url: 'https://mainline.i3s.unice.fr/wam2/packages/obxd/index.js',
    tags: ['synthesizer', 'analog', 'oberheim', 'subtractive'],
  },
  {
    id: 'wam-dattorro-reverb',
    name: 'Dattorro Reverb',
    vendor: 'WAM Team',
    description: 'High-quality plate reverb based on the Dattorro algorithm',
    category: 'effect',
    subcategory: 'reverb',
    url: 'https://mainline.i3s.unice.fr/wam2/packages/dattorro/index.js',
    tags: ['reverb', 'plate', 'dattorro'],
  },
  {
    id: 'wam-livegain',
    name: 'LiveGain',
    vendor: 'WAM Team',
    description: 'Simple gain/volume utility with metering',
    category: 'effect',
    subcategory: 'utility',
    url: 'https://mainline.i3s.unice.fr/wam2/packages/livegain/index.js',
    tags: ['gain', 'volume', 'utility', 'meter'],
  },
  {
    id: 'wam-distortion',
    name: 'Distortion',
    vendor: 'WAM Team',
    description: 'Waveshaper distortion with multiple curve types',
    category: 'effect',
    subcategory: 'distortion',
    url: 'https://mainline.i3s.unice.fr/wam2/packages/distortion/index.js',
    tags: ['distortion', 'overdrive', 'waveshaper'],
  },
];

/** Search the catalog by query string (name, vendor, tags, description). */
export function searchCatalog(
  query: string,
  category?: 'instrument' | 'effect',
): WAMCatalogEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return WAM_CATALOG.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (terms.length === 0) return true;

    const searchable = [
      entry.name,
      entry.vendor,
      entry.description,
      entry.subcategory,
      ...entry.tags,
    ]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}

/** Get all unique subcategories from the catalog. */
export function getCatalogSubcategories(): string[] {
  const subcats = new Set(WAM_CATALOG.map((e) => e.subcategory));
  return Array.from(subcats).sort();
}

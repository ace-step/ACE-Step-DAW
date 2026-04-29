/**
 * WAM (Web Audio Module) 2.0 integration — barrel export.
 */
export { WAMHost, wamHost, validatePluginUrl } from './WAMHost';
export type { WAMPluginHandle } from './WAMHost';
export { WAMPluginAdapter } from './WAMPluginAdapter';
export { WAM_CATALOG, searchCatalog, getCatalogSubcategories } from './WAMCatalog';

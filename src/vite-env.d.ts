/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOURCE_CODE_URL?: string;
  readonly VITE_LICENSE_URL?: string;
  readonly VITE_COPYRIGHT_NOTICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

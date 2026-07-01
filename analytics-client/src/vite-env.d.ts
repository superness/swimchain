/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_HOST?: string;
  readonly VITE_RPC_PORT?: string;
  readonly VITE_RPC_PROTOCOL?: 'http' | 'https';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

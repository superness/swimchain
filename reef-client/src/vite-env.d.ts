/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REEF_SPACE?: string;
  readonly VITE_RPC_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

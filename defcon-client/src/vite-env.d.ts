/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_ENDPOINT?: string;
  readonly VITE_DEFCON_SPONSOR?: string;
  readonly VITE_DEFCON_SPACE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

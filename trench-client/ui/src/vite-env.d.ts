/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRENCH_SPACE?: string;
  readonly VITE_GAME_SPONSOR?: string;
  readonly VITE_RPC_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

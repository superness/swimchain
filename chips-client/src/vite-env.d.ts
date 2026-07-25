/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHIPS_RPC?: string;
  readonly VITE_CHIPS_SPACE?: string;
  readonly VITE_GAME_SPONSOR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

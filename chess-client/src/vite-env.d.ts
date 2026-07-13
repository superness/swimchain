/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHESS_SPACE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Salted SHA-256 hash for the demo access gate. Public (embedded in the bundle); not a secret. */
  readonly VITE_ACCESS_PASSWORD_HASH?: string;
}

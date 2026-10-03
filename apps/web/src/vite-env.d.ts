/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin for production builds (e.g. https://api.example.com). Empty → `/api` proxy. */
  readonly VITE_API_URL?: string;
  /** Sent as `x-admin-token` on `/admin/*` calls when the API has `ADMIN_TOKEN` set. */
  readonly VITE_ADMIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

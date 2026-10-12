export interface Env {
  DB: D1Database;
  MARKET_HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  AI?: Ai;
  APP_MODE: "demo" | "live";
  ADMIN_PASSWORD_HASH?: string;
  ENCRYPTION_KEY?: string;
  OANDA_ACCOUNT_ID?: string;
  OANDA_ENV?: "practice" | "live";
}
export type { Slot } from "../../../packages/shared/src/ai-config";
export { defaultSlots } from "../../../packages/shared/src/ai-config";
export { connectionProviders as providerNames } from "../../../packages/shared/src/ai-config";

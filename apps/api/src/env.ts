export interface Env {
  DB: D1Database;
  MARKET_HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  AI?: Ai;
  APP_MODE: "demo" | "live";
  ADMIN_PASSWORD?: string;
  ENCRYPTION_KEY?: string;
  OANDA_ACCOUNT_ID?: string;
  OANDA_ENV?: "practice" | "live";
}
export interface Slot {
  provider: string;
  model: string;
}
export const defaultSlots: Slot[] = [
  { provider: "Workers AI", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
  { provider: "Gemini", model: "gemini-2.5-flash" },
  { provider: "Groq", model: "llama-3.3-70b-versatile" },
  { provider: "OpenRouter", model: "mistralai/mistral-small-3.2-24b-instruct" },
];
export const providerNames = [
  "Workers AI",
  "Gemini",
  "Groq",
  "OpenRouter",
  "Mistral",
  "Hugging Face",
  "Cohere",
  "NVIDIA",
  "OANDA",
  "Twelve Data",
  "Discord",
];

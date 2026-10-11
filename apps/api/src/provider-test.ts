import type { Env } from "./env";
import { credential } from "./data";
import { safeWebhook } from "./notifications";
export async function testProvider(
  env: Env,
  provider: string,
): Promise<{ status: "valid" | "failed" | "missing"; message: string }> {
  if (provider === "Workers AI")
    return {
      status: env.AI ? "valid" : "missing",
      message: env.AI
        ? "Binding AI tersedia; belum melakukan inference berbayar."
        : "Binding AI belum tersedia.",
    };
  const key = await credential(env, provider);
  if (!key) return { status: "missing", message: "Kredensial belum tersedia." };
  const urls: Record<string, string> = {
    Gemini: "https://generativelanguage.googleapis.com/v1beta/models",
    Groq: "https://api.groq.com/openai/v1/models",
    OpenRouter: "https://openrouter.ai/api/v1/key",
    Mistral: "https://api.mistral.ai/v1/models",
    "Hugging Face": "https://huggingface.co/api/whoami-v2",
    Cohere: "https://api.cohere.com/v1/models",
    NVIDIA: "https://integrate.api.nvidia.com/v1/models",
    OANDA: `https://${env.OANDA_ENV === "live" ? "api-fxtrade.oanda.com" : "api-fxpractice.oanda.com"}/v3/accounts`,
    "Twelve Data": `https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${encodeURIComponent(key)}`,
    Discord: safeWebhook(key) ? key : "",
  };
  try {
    const response = await fetch(urls[provider], {
      headers:
        provider === "Gemini"
          ? { "x-goog-api-key": key }
          : ["Discord", "Twelve Data"].includes(provider)
            ? {}
            : { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    const payload = (await response.json()) as {
      status?: string;
      error?: unknown;
    };
    if (!response.ok || payload.status === "error" || payload.error)
      return {
        status: "failed",
        message: "Provider menolak akses; periksa key, izin, atau kuota.",
      };
    return {
      status: "valid",
      message:
        "Permintaan baca provider berhasil. Akses model/plan tertentu tetap bergantung akun.",
    };
  } catch {
    return {
      status: "failed",
      message: "Provider tidak terjangkau. Periksa jaringan dan kredensial.",
    };
  }
}

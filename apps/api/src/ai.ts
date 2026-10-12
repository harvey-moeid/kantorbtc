import {
  voteSchema,
  type Candle,
  type CotContext,
  type Scan,
  type Symbol,
  type Timeframe,
  type Vote,
} from "../../../packages/shared/src/domain";
import type { Env, Slot } from "./env";
import type { AiTarget } from "../../../packages/shared/src/ai-config";
import { credential } from "./data";
import { fetchJson } from "./market";
const endpoints: Record<string, string> = {
  Groq: "https://api.groq.com/openai/v1/chat/completions",
  OpenRouter: "https://openrouter.ai/api/v1/chat/completions",
  Mistral: "https://api.mistral.ai/v1/chat/completions",
  "Hugging Face": "https://router.huggingface.co/v1/chat/completions",
  NVIDIA: "https://integrate.api.nvidia.com/v1/chat/completions",
};
export async function callSlot(
  env: Env,
  slot: Slot,
  context: {
    symbol: Symbol;
    tf: Timeframe;
    scanner: Scan[];
    candles: Candle[];
    source: string;
    language: "id" | "en";
    cot?: CotContext;
  },
): Promise<Vote> {
  const started = Date.now();
  const attempts: NonNullable<Vote["attempts"]> = [];
  const abstain = (): Vote => ({
    provider: slot.provider,
    model: slot.model,
    direction: "abstain",
    confidence: 0,
    reason:
      context.language === "id"
        ? "Provider utama dan cadangan tidak tersedia atau gagal setelah satu retry."
        : "Primary and fallback providers are unavailable or failed after one retry.",
    levels: null,
    risks: [
      context.language === "id" ? "Suara tidak dihitung." : "Vote excluded.",
    ],
    latency: Date.now() - started,
    attempts,
  });
  const prompt = `You are one of four independent market analysts. Use only the supplied closed candles, scanner evidence, and optional COT context. COT is weekly managed-money positioning in gold futures, not spot prices or a realtime trigger. Its reportDate is the position observation date, not publication date. Treat it as low-priority background only; never change scanner scores or manufacture trade direction from COT alone. If absent, stale, or unavailable, ignore positioning and mention the limitation. This is an informational analysis system, never order execution. Return JSON only matching {"direction":"long|short|netral","confidence":0-100,"reason":"2-3 sentences","levels":{"entry":[low,high],"sl":positive,"tp":[one to three positive targets]} or null,"risks":[strings]}. For neutral, levels must be null. Long SL below entry and TP above; reverse for short. Single entry uses [price,price]. Explain in ${context.language === "id" ? "Bahasa Indonesia" : "English"}. Do not invent external market facts. CONTEXT: ${JSON.stringify({ ...context, cot: context.symbol === "XAUUSD" && context.cot ? { ...context.cot, report: context.cot.status === "fresh" ? context.cot.report : null } : undefined, candles: context.candles.slice(-60) })}`;
  const targets: AiTarget[] = [slot, ...(slot.fallbacks ?? [])];
  for (const target of targets) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptStarted = Date.now();
      const signal = AbortSignal.timeout(12000);
      let status: NonNullable<Vote["attempts"]>[number]["status"] =
        "provider_error";
      try {
        let output: unknown;
        if (target.provider === "Workers AI") {
          if (!env.AI) {
            status = "unavailable";
            throw new Error("Unavailable");
          }
          const result = await env.AI.run(
            target.model as Parameters<Ai["run"]>[0],
            { messages: [{ role: "user", content: prompt }], max_tokens: 1000 },
            { signal },
          );
          output = (result as { response?: string }).response;
        } else {
          const key = await credential(env, target.provider);
          if (!key) {
            status = "unavailable";
            throw new Error("Unavailable");
          }
          if (target.provider === "Gemini") {
            const result = await fetchJson<{
              candidates?: { content: { parts: { text: string }[] } }[];
            }>(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(target.model)}:generateContent`,
              {
                method: "POST",
                signal,
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": key,
                },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.2,
                  },
                }),
              },
            );
            output = result.candidates?.[0]?.content.parts
              .map((p) => p.text)
              .join("");
          } else if (target.provider === "Cohere") {
            const result = await fetchJson<{
              message?: { content: { text: string }[] };
            }>("https://api.cohere.com/v2/chat", {
              method: "POST",
              signal,
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: target.model,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
              }),
            });
            output = result.message?.content.map((p) => p.text).join("");
          } else {
            const endpoint = endpoints[target.provider];
            if (!endpoint) {
              status = "unavailable";
              throw new Error("Unavailable");
            }
            const result = await fetchJson<{
              choices?: { message: { content: string } }[];
            }>(endpoint, {
              method: "POST",
              signal,
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: target.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 1000,
                response_format: { type: "json_object" },
              }),
            });
            output = result.choices?.[0]?.message.content;
          }
        }
        status = "invalid_output";
        const parsed = voteSchema.parse(
          typeof output === "string"
            ? JSON.parse(output.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))
            : output,
        );
        return {
          ...parsed,
          provider: target.provider,
          model: target.model,
          latency: Date.now() - started,
          attempts: [
            ...attempts,
            {
              provider: target.provider,
              model: target.model,
              status: "valid",
              latency: Date.now() - attemptStarted,
            },
          ],
        };
      } catch {
        attempts.push({
          provider: target.provider,
          model: target.model,
          status: signal.aborted ? "timeout" : status,
          latency: Date.now() - attemptStarted,
        });
        // Missing bindings/credentials cannot recover by immediately retrying.
        if (status === "unavailable") break;
      }
    }
  }
  return abstain();
}

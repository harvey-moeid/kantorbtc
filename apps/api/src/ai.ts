import {
  voteSchema,
  type Candle,
  type Scan,
  type Symbol,
  type Timeframe,
  type Vote,
} from "../../../packages/shared/src/domain";
import type { Env, Slot } from "./env";
import { credential } from "./data";
import { fetchJson } from "./market";
import { withDeadline } from "./deadline";
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
  },
): Promise<Vote> {
  const started = Date.now(),
    abstain = (): Vote => ({
      provider: slot.provider,
      model: slot.model,
      direction: "abstain",
      confidence: 0,
      reason:
        "Provider tidak tersedia, timeout, atau output tidak valid setelah satu retry.",
      levels: null,
      risks: ["Suara tidak dihitung."],
      latency: Date.now() - started,
    });
  const prompt = `You are one of four independent market analysts. Use only the supplied closed candles and scanner evidence. This is an informational analysis system, never order execution. Return JSON only matching {"direction":"long|short|netral","confidence":0-100,"reason":"2-3 sentences","levels":{"entry":[low,high],"sl":positive,"tp":[one to three positive targets]} or null,"risks":[strings]}. For neutral, levels must be null. Long SL below entry and TP above; reverse for short. Single entry uses [price,price]. Explain in ${context.language === "id" ? "Bahasa Indonesia" : "English"}. Do not invent external market facts. CONTEXT: ${JSON.stringify({ ...context, candles: context.candles.slice(-60) })}`;
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      let output: unknown;
      if (slot.provider === "Workers AI") {
        if (!env.AI) return abstain();
        const ai = env.AI;
        const result = await withDeadline(
          (signal) =>
            ai.run(
              slot.model as Parameters<Ai["run"]>[0],
              {
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1000,
              },
              { signal },
            ),
          12000,
        );
        output = (result as { response?: string }).response;
      } else {
        const key = await credential(env, slot.provider);
        if (!key) return abstain();
        if (slot.provider === "Gemini") {
          const result = await fetchJson<{
            candidates?: { content: { parts: { text: string }[] } }[];
          }>(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slot.model)}:generateContent`,
            {
              method: "POST",
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
        } else if (slot.provider === "Cohere") {
          const result = await fetchJson<{
            message?: { content: { text: string }[] };
          }>("https://api.cohere.com/v2/chat", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: slot.model,
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" },
            }),
          });
          output = result.message?.content.map((p) => p.text).join("");
        } else {
          const endpoint = endpoints[slot.provider];
          if (!endpoint) return abstain();
          const result = await fetchJson<{
            choices?: { message: { content: string } }[];
          }>(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: slot.model,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.2,
              max_tokens: 1000,
              response_format: { type: "json_object" },
            }),
          });
          output = result.choices?.[0]?.message.content;
        }
      }
      const parsed = voteSchema.parse(
        typeof output === "string"
          ? JSON.parse(output.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))
          : output,
      );
      return {
        ...parsed,
        provider: slot.provider,
        model: slot.model,
        latency: Date.now() - started,
      };
    } catch {
      /* Exactly one retry; provider error details never include credentials. */
    }
  return abstain();
}

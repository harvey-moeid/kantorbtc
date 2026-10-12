import { z } from "zod";

export const aiProviders = [
  "Workers AI",
  "Gemini",
  "Groq",
  "OpenRouter",
  "Mistral",
  "Hugging Face",
  "Cohere",
  "NVIDIA",
] as const;
export const connectionProviders: readonly string[] = [
  ...aiProviders,
  "OANDA",
  "Twelve Data",
  "Discord",
];
const targetSchema = z.object({
  provider: z.enum(aiProviders),
  model: z.string().trim().min(1).max(160),
});
export const slotSchema = targetSchema
  .extend({
    fallbacks: z.array(targetSchema).max(2).default([]),
  })
  .superRefine((slot, ctx) => {
    const targets = [slot, ...slot.fallbacks];
    const ids = targets.map((target) => `${target.provider}:${target.model}`);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider/model cadangan tidak boleh berulang.",
        path: ["fallbacks"],
      });
  });
export const aiSettingsSchema = z.object({
  slots: z.array(slotSchema).length(4),
});
export type AiTarget = z.infer<typeof targetSchema>;
export type Slot = z.infer<typeof slotSchema>;
export const defaultSlots: Slot[] = [
  {
    provider: "Workers AI",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    fallbacks: [],
  },
  { provider: "Gemini", model: "gemini-2.5-flash", fallbacks: [] },
  { provider: "Groq", model: "llama-3.3-70b-versatile", fallbacks: [] },
  {
    provider: "OpenRouter",
    model: "mistralai/mistral-small-3.2-24b-instruct",
    fallbacks: [],
  },
];

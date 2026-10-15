// Suggested IDs; availability depends on the provider account. Custom IDs remain supported.
export const providerModels: Record<string, string[]> = {
  "Workers AI": [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/qwen/qwen3-30b-a3b-fp8",
  ],
  Gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  Groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
  ],
  OpenRouter: [
    "mistralai/mistral-small-3.2-24b-instruct",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat-v3-0324",
  ],
  Mistral: [
    "mistral-small-latest",
    "mistral-large-latest",
    "ministral-8b-latest",
  ],
  "Hugging Face": [
    "Qwen/Qwen2.5-72B-Instruct",
    "meta-llama/Llama-3.3-70B-Instruct",
  ],
  Cohere: ["command-a-03-2025", "command-r-plus-08-2024", "command-r-08-2024"],
  NVIDIA: [
    "meta/llama-3.3-70b-instruct",
    "deepseek-ai/deepseek-r1",
    "qwen/qwen2.5-72b-instruct",
  ],
};

export const defaultAISlots = [
  { provider: "Workers AI", model: providerModels["Workers AI"][0] },
  { provider: "Gemini", model: providerModels.Gemini[0] },
  { provider: "Groq", model: providerModels.Groq[0] },
  { provider: "OpenRouter", model: providerModels.OpenRouter[0] },
];

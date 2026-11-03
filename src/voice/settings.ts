export const CONNECTION_KEY = "margin.openai-key.v1";
export const GEMINI_KEY = "margin.gemini-key.v1";
export const MODEL_KEY = "margin.voice-model.v1";
export const SETTINGS_CHANGED = "margin-connection-changed";
export const OPEN_SETTINGS = "margin-open-connection";
export type Provider = "openai" | "gemini";
export type VoiceModel = {
  id: string;
  name: string;
  provider: Provider;
  transport: "realtime" | "live" | "gemini";
  description: string;
  group: string;
};
export const VOICE_MODELS: VoiceModel[] = [
  {
    id: "gpt-realtime-2.1",
    name: "GPT-Realtime 2.1",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Current",
    description:
      "Recommended for this reader. Voice, page images, reasoning and document tools.",
  },
  {
    id: "gpt-realtime-2.1-mini",
    name: "GPT-Realtime 2.1 Mini",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Current",
    description:
      "Faster, lower-cost realtime reasoning. Supports voice, page images and tools.",
  },
  {
    id: "gpt-live-1",
    name: "GPT-Live 1",
    provider: "openai",
    transport: "live",
    group: "OpenAI · Current",
    description:
      "Full-duplex conversation. Uses GPT-6 Luna for document reasoning and images. Voice duration and backend usage are billed separately. Experimental connection.",
  },
  {
    id: "gpt-realtime-2",
    name: "GPT-Realtime 2",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Earlier models",
    description: "Previous reasoning voice model with image input and tools.",
  },
  {
    id: "gpt-realtime-1.5",
    name: "GPT-Realtime 1.5",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Earlier models",
    description:
      "Earlier non-reasoning realtime voice model with image input and tools.",
  },
  {
    id: "gpt-realtime",
    name: "GPT-Realtime (legacy)",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Earlier models",
    description:
      "Legacy model. OpenAI lists retirement on January 20, 2027; prefer 2.1.",
  },
  {
    id: "gpt-realtime-mini",
    name: "GPT-Realtime Mini (legacy)",
    provider: "openai",
    transport: "realtime",
    group: "OpenAI · Earlier models",
    description:
      "Legacy lower-cost model. OpenAI lists retirement on January 20, 2027; prefer 2.1 Mini.",
  },
  {
    id: "gemini-3.8-live",
    name: "Gemini 3.8 Live",
    provider: "gemini",
    transport: "gemini",
    group: "Google Gemini · Current",
    description:
      "Google’s current low-latency voice model with visual input and tools. Requires a Gemini API key. Experimental connection.",
  },
  {
    id: "gemini-3.8-live-extended-thinking",
    name: "Gemini 3.8 Live · Extended Thinking",
    provider: "gemini",
    transport: "gemini",
    group: "Google Gemini · Current",
    description:
      "More reasoning for complex voice tasks; responses may take longer. Requires a Gemini API key. Experimental connection.",
  },
  {
    id: "gemini-3.1-flash-live-preview",
    name: "Gemini 3.1 Flash Live (preview)",
    provider: "gemini",
    transport: "gemini",
    group: "Google Gemini · Earlier previews",
    description:
      "Earlier Live preview, subject to Google’s preview availability. Prefer Gemini 3.8 Live.",
  },
  {
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    name: "Gemini 2.5 Flash Native Audio (preview)",
    provider: "gemini",
    transport: "gemini",
    group: "Google Gemini · Earlier previews",
    description:
      "Earlier native-audio preview. Availability depends on your Google project.",
  },
];
export const MODELS = VOICE_MODELS.map((model) => model.id);
export const providerName = (provider: Provider) =>
  provider === "openai" ? "OpenAI" : "Google Gemini";
export const providerKey = (provider: Provider) =>
  provider === "openai" ? CONNECTION_KEY : GEMINI_KEY;
export const modelInfo = (id: string | null) =>
  VOICE_MODELS.find((model) => model.id === id) || VOICE_MODELS[0];
export function readModel() {
  return modelInfo(localStorage.getItem(MODEL_KEY));
}
export function readConnection() {
  const info = readModel();
  return {
    key: localStorage.getItem(providerKey(info.provider))?.trim() || "",
    model: info.id,
    provider: info.provider,
    transport: info.transport,
  };
}
export function validateProviderKey(provider: Provider, key: string) {
  if (!key.trim())
    throw new Error(`Enter a ${providerName(provider)} API key.`);
  if (provider === "gemini" && key.trim().startsWith("sk-"))
    throw new Error(
      "That looks like an OpenAI key. Gemini requires its own Google API key.",
    );
  if (provider === "openai" && key.trim().startsWith("AIza"))
    throw new Error(
      "That looks like a Google key. OpenAI requires its own API key.",
    );
}
export function saveSelection(id: string, newKey?: string) {
  const info = VOICE_MODELS.find((model) => model.id === id);
  if (!info) throw new Error("Choose a supported voice model.");
  const keyName = providerKey(info.provider);
  const key = newKey?.trim() || localStorage.getItem(keyName)?.trim() || "";
  validateProviderKey(info.provider, key);
  // Store provider credentials separately; never infer one provider's key from another.
  if (newKey) localStorage.setItem(keyName, key);
  localStorage.setItem(MODEL_KEY, id);
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
}
export function reportedModel(value: unknown) {
  return typeof value === "string" &&
    VOICE_MODELS.some(
      (m) =>
        value === m.id ||
        (value.startsWith(m.id + "-") &&
          /^20\d{2}-\d{2}-\d{2}$/.test(value.slice(m.id.length + 1))),
    )
    ? value
    : null;
}

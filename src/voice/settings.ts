export const CONNECTION_KEY = "margin.openai-key.v1";
export const MODEL_KEY = "margin.voice-model.v1";
export const SETTINGS_CHANGED = "margin-connection-changed";
export const OPEN_SETTINGS = "margin-open-connection";
export const MODELS = [
  "gpt-realtime-2.1",
  "gpt-realtime",
  "gpt-realtime-mini",
] as const;
export function readConnection() {
  const model = localStorage.getItem(MODEL_KEY);
  return {
    key: localStorage.getItem(CONNECTION_KEY)?.trim() || "",
    model: MODELS.find((value) => value === model) || MODELS[0],
  };
}

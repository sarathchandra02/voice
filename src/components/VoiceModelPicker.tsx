import { useEffect, useId, useState } from "react";
import {
  MODEL_KEY,
  CONNECTION_KEY,
  GEMINI_KEY,
  SETTINGS_CHANGED,
  VOICE_MODELS,
  modelInfo,
  providerKey,
  providerName,
  readModel,
  saveSelection,
} from "../voice/settings";

export default function VoiceModelPicker({
  compact = false,
}: {
  compact?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(VOICE_MODELS[0].id);
  const [pending, setPending] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const sync = () => {
      try {
        setSelected(readModel().id);
        setPending(null);
        setKey("");
      } catch {
        setError("Browser storage is unavailable.");
      }
    };
    const storage = (e: StorageEvent) => {
      if (!e.key || [MODEL_KEY, CONNECTION_KEY, GEMINI_KEY].includes(e.key))
        sync();
    };
    sync();
    window.addEventListener(SETTINGS_CHANGED, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const info = modelInfo(pending || selected);
  function cancel() {
    setPending(null);
    setKey("");
    setError("");
    setNotice("");
  }
  function choose(value: string) {
    cancel();
    try {
      const next = modelInfo(value);
      if (!localStorage.getItem(providerKey(next.provider))?.trim()) {
        setPending(value);
        return;
      }
      saveSelection(value);
      setNotice("Model saved. Start voice to connect.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save model.");
    }
  }
  return (
    <div className={`voice-model-picker ${compact ? "compact" : ""}`}>
      <label htmlFor={id}>
        {compact ? "Voice model" : "Provider and voice model"}
      </label>
      <select
        id={id}
        value={selected}
        onChange={(e) => choose(e.target.value)}
        aria-describedby={id + "-help"}
      >
        {[...new Set(VOICE_MODELS.map((m) => m.group))].map((group) => (
          <optgroup key={group} label={group}>
            {VOICE_MODELS.filter((m) => m.group === group).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {!compact && (
        <p id={id + "-help"}>
          {info.description}
          <br />
          <code>{info.id}</code>
        </p>
      )}
      {compact && (
        <small id={id + "-help"}>
          Changing models ends the current voice session.
        </small>
      )}
      {pending && (
        <div
          className="provider-key-prompt"
          role="group"
          aria-label={`Set up ${providerName(info.provider)}`}
        >
          <strong>
            Add {providerName(info.provider)} to use {info.name}
          </strong>
          <p>
            No {providerName(info.provider)} key is saved.{" "}
            {info.provider === "gemini"
              ? "Your OpenAI key cannot connect to Gemini."
              : "A Gemini key cannot connect to OpenAI."}{" "}
            Cancel keeps your current model.
          </p>
          <label htmlFor={id + "-key"}>
            {providerName(info.provider)} API key
          </label>
          <input
            id={id + "-key"}
            type="password"
            autoComplete="off"
            value={key}
            maxLength={512}
            onChange={(e) => setKey(e.target.value)}
          />
          <small>
            Saved in this browser and sent only to {providerName(info.provider)}
            . Access is checked when you start voice.
          </small>
          <div className="provider-key-actions">
            <button
              type="button"
              disabled={!key.trim()}
              onClick={() => {
                try {
                  saveSelection(pending, key);
                  setPending(null);
                  setKey("");
                  setError("");
                  setNotice("Key and model saved. Start voice to connect.");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not save this connection.",
                  );
                }
              }}
            >
              Save and switch
            </button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="small muted">{notice}</p>}
      {!compact && (
        <p className="small muted">
          Conversational voice models verified against provider docs on 3
          November 2026. Model access depends on your account.{" "}
          <a
            href="https://developers.openai.com/api/docs/models"
            target="_blank"
            rel="noreferrer"
          >
            OpenAI catalog
          </a>{" "}
          ·{" "}
          <a
            href="https://aistudio.google.com/docs/models"
            target="_blank"
            rel="noreferrer"
          >
            Gemini catalog
          </a>
        </p>
      )}
    </div>
  );
}

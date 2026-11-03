import VoiceModelPicker from "./VoiceModelPicker";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, KeyRound, Settings2, X } from "lucide-react";

import {
  CONNECTION_KEY,
  GEMINI_KEY,
  MODEL_KEY,
  providerKey,
  providerName,
  type Provider,
  validateProviderKey,
  OPEN_SETTINGS,
  SETTINGS_CHANGED,
  readConnection,
} from "../voice/settings";

export default function ConnectionSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [provider, setProvider] = useState<Provider>("openai");
  function refresh() {
    try {
      const connection = readConnection();
      setProvider(connection.provider);
      setDraft("");
      setConfigured(Boolean(connection.key));
    } catch {
      setConfigured(false);
      setError(
        "Browser storage is unavailable. Reading still works; a key cannot be saved here.",
      );
    }
  }
  useEffect(() => {
    refresh();
    const changed = (event: StorageEvent) => {
      if (
        [CONNECTION_KEY, GEMINI_KEY, MODEL_KEY].includes(event.key || "") ||
        event.key === null
      )
        refresh();
    };
    window.addEventListener("storage", changed);
    const show = () => {
      refresh();
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS, show);
    window.addEventListener(SETTINGS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener(OPEN_SETTINGS, show);
      window.removeEventListener(SETTINGS_CHANGED, refresh);
    };
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  function close() {
    setDraft("");
    setError("");
    setNotice("");
    setOpen(false);
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const key = draft.trim();
    if (!key) {
      setError("Enter an API key to save it.");
      return;
    }
    try {
      validateProviderKey(provider, key);
      localStorage.setItem(providerKey(provider), key);
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
      setConfigured(true);
      setDraft("");
      setError("");
      setNotice("Key saved in this browser. No API request was made.");
    } catch {
      setError(
        "Your browser could not save the key. Check its storage settings and try again.",
      );
    }
  }
  function remove() {
    try {
      localStorage.removeItem(providerKey(provider));
      window.dispatchEvent(new Event(SETTINGS_CHANGED));
      setConfigured(false);
      setDraft("");
      setError("");
      setNotice("Saved key removed from this browser.");
    } catch {
      setError(
        "The key could not be removed. Check your browser storage settings.",
      );
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="icon-button connection-trigger"
        aria-label="Connection settings"
        title="Connection settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setError("");
          setNotice("");
          refresh();
          setOpen(true);
        }}
      >
        <Settings2 size={19} />
      </button>
      <dialog
        ref={dialog}
        className="connection-dialog"
        aria-labelledby="connection-title"
        onCancel={close}
        onClose={close}
      >
        <div className="connection-dialog-top">
          <span className="connection-symbol">
            <KeyRound size={21} />
          </span>
          <button
            autoFocus
            className="icon-button"
            aria-label="Close connection settings"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        <span className="eyebrow">YOUR CONNECTION</span>
        <h2 id="connection-title">A voice for your reading.</h2>
        <p className="connection-description">
          Choose a voice model and connect its provider. OpenAI and Google
          Gemini use separate keys.
        </p>
        <div className="connection-status">
          {configured ? <Check size={14} /> : <KeyRound size={14} />}
          <span>
            {configured ? "Key saved · not verified" : "No key saved"}
          </span>
        </div>
        <form onSubmit={save}>
          <label className="connection-label">
            {providerName(provider)} API key
            <input
              type="password"
              aria-label={`${providerName(provider)} API key`}
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                configured ? "Enter a replacement key" : "Paste your API key"
              }
              maxLength={512}
            />
          </label>
          <VoiceModelPicker key={open ? "open" : "closed"} />
          <p className="connection-storage-note">
            Saved unencrypted in this browser. Scripts running on this site can
            access it. Use a trusted device and remove the key here when you no
            longer need it.
          </p>
          <p className="connection-availability">
            Saving a key makes no API request. Start voice connects to the
            selected provider and sends microphone audio and requested document
            excerpts or images. API usage is billed to that provider account.
            Changing settings stops an active session.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="connection-notice" role="status">
              {notice}
            </p>
          )}
          <button
            type="submit"
            className="connection-save"
            disabled={!draft.trim()}
          >
            {configured ? "Update key" : "Save key"}
            <ArrowRight size={15} />
          </button>
        </form>
        {configured && (
          <button className="text-button forget-connection" onClick={remove}>
            Remove saved key
          </button>
        )}
      </dialog>
    </>
  );
}

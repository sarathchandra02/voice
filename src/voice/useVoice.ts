import { AdditionalVoice } from "./additional";
import { useEffect, useRef, useState } from "react";
import type { ReaderDocument } from "../documents/base";
import { INITIAL_VOICE, RealtimeVoice, type VoiceActivity } from "./realtime";
import {
  CONNECTION_KEY,
  GEMINI_KEY,
  MODEL_KEY,
  OPEN_SETTINGS,
  readConnection,
  SETTINGS_CHANGED,
} from "./settings";

export function useVoice(
  doc: ReaderDocument,
  page: number | null,
  onActivity: (event: VoiceActivity) => void,
) {
  const [state, setState] = useState({ ...INITIAL_VOICE });
  const session = useRef<RealtimeVoice | AdditionalVoice | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const currentPage = useRef(page);
  currentPage.current = page;
  useEffect(() => {
    const stopHidden = () => {
      if (document.visibilityState === "hidden")
        session.current?.stop(
          "Voice stopped while the app was in the background.",
        );
    };
    const stopLeaving = () => session.current?.stop();
    const stopOffline = () =>
      session.current?.stop(
        "You are offline. Start voice when your connection returns.",
      );
    const changed = () =>
      session.current?.stop(
        "Connection settings changed. Start voice to use the updated settings.",
      );
    const storage = (event: StorageEvent) => {
      if (
        event.key === null ||
        [CONNECTION_KEY, GEMINI_KEY, MODEL_KEY].includes(event.key)
      )
        changed();
    };
    document.addEventListener("visibilitychange", stopHidden);
    window.addEventListener("pagehide", stopLeaving);
    window.addEventListener("offline", stopOffline);
    window.addEventListener(SETTINGS_CHANGED, changed);
    window.addEventListener("storage", storage);
    return () => {
      session.current?.stop();
      document.removeEventListener("visibilitychange", stopHidden);
      window.removeEventListener("pagehide", stopLeaving);
      window.removeEventListener("offline", stopOffline);
      window.removeEventListener(SETTINGS_CHANGED, changed);
      window.removeEventListener("storage", storage);
    };
  }, [doc]);
  function start() {
    if (["connecting", "connected"].includes(state.status) || !audio.current)
      return;
    try {
      const connection = readConnection();
      if (!connection.key) {
        window.dispatchEvent(new Event(OPEN_SETTINGS));
        return;
      }
      session.current?.stop();
      const Voice =
        connection.transport === "realtime" ? RealtimeVoice : AdditionalVoice;
      const next = new Voice(
        doc,
        () => currentPage.current,
        audio.current,
        setState,
        onActivity,
      );
      session.current = next;
      void next.start(connection.key, connection.model);
    } catch {
      setState({
        ...INITIAL_VOICE,
        status: "error",
        message:
          "Browser storage is unavailable. Open Connection settings to save your key.",
      });
    }
  }
  return {
    state,
    audio,
    start,
    stop: () => session.current?.stop(),
    interrupt: () => session.current?.interrupt(),
    mute: () =>
      state.muted ? void session.current?.unmute() : session.current?.mute(),
    text: (value: string) => session.current?.text(value),
    enableAudio: () => void session.current?.enableAudio(),
  };
}

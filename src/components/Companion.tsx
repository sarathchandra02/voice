import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  FileImage,
  MessageCircle,
  MicOff,
  Mic,
  Square,
  Send,
  Search,
  X,
} from "lucide-react";
import type { PdfDocument } from "../documents/pdf";
import type { Source } from "../documents/model";
import Research from "./Research";
import { useVoice } from "../voice/useVoice";
import type { VoiceActivity } from "../voice/realtime";

export type ActivityDraft = {
  kind: "context" | "request" | "lookup" | "error" | "user" | "assistant";
  title: string;
  detail: string;
  sources?: Source[];
  delivery?: "pending" | "accepted" | "failed";
};
type Activity = ActivityDraft & { id: string };

function SourcePreview({
  source,
  doc,
  navigate,
  delivery,
}: {
  source: Source;
  doc: PdfDocument;
  navigate: (page: number) => void;
  delivery?: "pending" | "accepted" | "failed";
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!source.image) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(source.image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source.image]);
  return (
    <details className="history-source" data-testid="history-source">
      <summary>
        <FileImage size={13} />
        <span>
          {source.label ? `Book ${source.label} · ` : ""}PDF page {source.page}
        </span>
        <span className="source-type">
          {source.kind === "image" ? "Page image" : "Text excerpt"}
        </span>
      </summary>
      <div className="history-source-body">
        <p className="source-format">
          {source.kind === "image"
            ? `Rendered page image · JPEG${source.width && source.height ? ` · ${source.width} × ${source.height} pixels` : ""}. Includes the page’s text and visuals.`
            : `Extracted text · ${source.text?.length.toLocaleString() ?? 0} characters${source.clipped ? " · shortened excerpt" : ""}. No page image included.`}
        </p>
        {source.label && (
          <p className="small muted">
            Book {source.label} is the printed label; PDF page {source.page} is
            its position in the file. Both identify this page.
          </p>
        )}
        {url && (
          <img
            src={url}
            alt={`Local context image of PDF page ${source.page}`}
          />
        )}
        {source.text && <p>{source.text}</p>}
        {source.kind === "image" && !url && (
          <p>This older image preview was released to save memory.</p>
        )}
        <p className="small muted">
          {source.clipped ? "Clipped excerpt. " : ""}
          {delivery === "accepted"
            ? "Received by OpenAI"
            : delivery === "pending"
              ? "Sending to OpenAI · awaiting receipt"
              : delivery === "failed"
                ? "Delivery to OpenAI unconfirmed"
                : "Prepared locally · not sent to AI"}
        </p>
        <button
          className="text-button"
          onClick={() => {
            if (!doc.disposed && source.documentId === doc.id)
              navigate(source.page);
          }}
        >
          Open in reader <ArrowUpRight size={13} />
        </button>
      </div>
    </details>
  );
}

export default function Companion({
  doc,
  navigate,
  contextPage,
  contextState,
  preparedSource,
  toolsOpen,
  closeTools,
}: {
  doc: PdfDocument;
  navigate: (page: number) => void;
  contextPage: number | null;
  contextState: string;
  preparedSource: Source | null;
  toolsOpen: boolean;
  closeTools: () => void;
}) {
  const [events, setEvents] = useState<Activity[]>([]);
  const [unseen, setUnseen] = useState(false);
  const [trimmed, setTrimmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastPrepared = useRef("");
  const [message, setMessage] = useState("");
  const append = useCallback((draft: ActivityDraft & { id?: string }) => {
    const event = { ...draft, id: draft.id || crypto.randomUUID() };
    setEvents((previous) => {
      // Keep a small local timeline and at most six image blobs. Never persist it.
      let images = 0;
      const existing = previous.findIndex((item) => item.id === event.id);
      const next =
        existing < 0
          ? [...previous, event]
          : previous.map((item, index) => (index === existing ? event : item));
      return next
        .slice(-30)
        .reverse()
        .map((item) => ({
          ...item,
          sources: item.sources?.map((source) => {
            if (!source.image || ++images <= 6) return source;
            const { image: _released, ...metadata } = source;
            return metadata;
          }),
        }))
        .reverse();
    });
    if (!atBottom.current) setUnseen(true);
  }, []);
  const voiceActivity = useCallback(
    (event: VoiceActivity) => append(event),
    [append],
  );
  const voice = useVoice(doc, contextPage, voiceActivity);
  const connected = voice.state.status === "connected";
  const connecting = voice.state.status === "connecting";
  const responding = connected && voice.state.activity !== "listening";
  const voiceLabel = !connected
    ? connecting
      ? "Connecting…"
      : "Ideas sound better out loud."
    : voice.state.activity === "speaking"
      ? "Speaking"
      : voice.state.activity === "thinking"
        ? "Thinking…"
        : voice.state.muted
          ? "Microphone muted"
          : "Listening";
  const voiceHint = responding
    ? voice.state.muted
      ? "Tap Stop reply to interrupt. Your microphone is off."
      : "You can speak to interrupt, or tap Stop reply."
    : voice.state.message;
  useEffect(() => {
    if (!preparedSource || preparedSource.documentId !== doc.id) return;
    const key = `${preparedSource.page}:${preparedSource.hash}`;
    if (lastPrepared.current === key) return;
    lastPrepared.current = key;
    append({
      kind: "context",
      title: `Reading context · PDF page ${preparedSource.page}`,
      detail:
        "You settled on this page. Its image is ready locally, but has not been sent to AI.",
      sources: [preparedSource],
    });
  }, [preparedSource, doc.id, append]);
  useEffect(() => {
    if (atBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
    if (events.length === 30) setTrimmed(true);
  }, [events]);
  useEffect(() => {
    const panel = dialog.current;
    if (toolsOpen && !panel?.open) panel?.showModal();
    if (!toolsOpen && panel?.open) panel.close();
  }, [toolsOpen]);
  function jumpToLatest() {
    if (history.current)
      history.current.scrollTop = history.current.scrollHeight;
    atBottom.current = true;
    setUnseen(false);
  }
  return (
    <div className="conversation-shell">
      <div className="conversation-heading">
        <span>Conversation</span>
        <span className="session-label">This session only</span>
      </div>
      <div
        className="conversation-history"
        role="log"
        aria-label="Conversation and activity history"
        aria-live="polite"
        ref={history}
        onScroll={() => {
          const el = history.current;
          if (!el) return;
          atBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (atBottom.current) setUnseen(false);
        }}
      >
        <div className="conversation-intro">
          <span className="intro-icon">
            <MessageCircle size={20} />
          </span>
          <h2>Your book. A little more perspective.</h2>
          <p>
            Your questions, replies, and shared pages will appear here when
            voice is connected.
          </p>
          <p className="intro-note">
            Start voice to talk. Requested pages and excerpts are shared with
            OpenAI during the conversation; local reading stays on your device.
          </p>
        </div>
        {trimmed && (
          <p className="history-limit">
            Showing the most recent 30 activities.
          </p>
        )}
        {events.map((event) => (
          <article
            key={event.id}
            className={`activity activity-${event.kind}`}
            data-testid="activity"
          >
            <span className="activity-symbol" aria-hidden="true">
              {event.kind === "context" ? (
                <FileImage size={15} />
              ) : event.kind === "request" ? (
                <Search size={15} />
              ) : event.kind === "error" ? (
                <X size={15} />
              ) : (
                <Check size={15} />
              )}
            </span>
            <div>
              <span className="activity-author">
                {event.kind === "request"
                  ? "YOU · LOCAL TOOL"
                  : event.kind === "user"
                    ? "YOU"
                    : event.kind === "assistant"
                      ? "MARGIN · AI"
                      : event.kind === "error"
                        ? "ACTIVITY UPDATE"
                        : "DOCUMENT ACTIVITY"}
              </span>
              <h3>{event.title}</h3>
              <p>{event.detail}</p>
              {event.sources?.map((source) => (
                <SourcePreview
                  key={source.id}
                  source={source}
                  doc={doc}
                  navigate={navigate}
                  delivery={event.delivery}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
      {unseen && (
        <button className="new-activity" onClick={jumpToLatest}>
          New activity <ArrowDown size={13} />
        </button>
      )}
      <div className="reading-context" title={contextState}>
        <span className="status-dot" />
        {contextPage
          ? `With you on PDF page ${contextPage}`
          : "Opening your page…"}
      </div>
      <div className="voice-dock">
        <div className="voice-dock-main">
          <div
            className={`voice-orb ${connected ? `voice-orb-${voice.state.muted && !responding ? "muted" : voice.state.activity}` : ""}`}
            role="img"
            aria-label={`Voice companion ${connected ? (voice.state.muted && !responding ? "muted" : voice.state.activity) : "idle"}`}
          />
          <div className="voice-dock-copy">
            <h3 aria-live="polite">{voiceLabel}</h3>
            <p
              id="voice-availability"
              role={voice.state.status === "error" ? "alert" : "status"}
            >
              {voiceHint}
            </p>
          </div>
        </div>
        <div className="voice-controls">
          <button
            className="voice-mute"
            aria-label={
              connected
                ? voice.state.muted
                  ? "Unmute microphone"
                  : "Mute microphone"
                : "Microphone off"
            }
            disabled={!connected}
            aria-pressed={voice.state.muted}
            title={voice.state.muted ? "Unmute microphone" : "Mute microphone"}
            onClick={voice.mute}
            aria-describedby="voice-availability"
          >
            {connected && !voice.state.muted ? (
              <Mic size={19} />
            ) : (
              <MicOff size={19} />
            )}
          </button>
          {responding && (
            <button className="interrupt-voice" onClick={voice.interrupt}>
              <Square size={14} /> Stop reply
            </button>
          )}
          <button
            className="start-voice"
            onClick={connected || connecting ? voice.stop : voice.start}
            aria-describedby="voice-availability"
          >
            {connected ? (
              <>
                <Square size={14} /> Stop voice
              </>
            ) : connecting ? (
              "Cancel connection"
            ) : (
              "Start voice"
            )}
          </button>
        </div>
        <audio ref={voice.audio} autoPlay />
        {voice.state.playbackBlocked && (
          <button onClick={voice.enableAudio}>Enable speaker audio</button>
        )}
        {connected && (
          <form
            className="voice-message"
            onSubmit={(event) => {
              event.preventDefault();
              voice.text(message);
              setMessage("");
            }}
          >
            <input
              aria-label="Message your companion"
              placeholder="Or type a question…"
              value={message}
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!message.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        )}
        <span className="dock-note">
          {connected
            ? `OpenAI · ${voice.state.muted ? "Mic off" : voice.state.activity} · ${voice.state.inputTokens.toLocaleString()} input / ${voice.state.outputTokens.toLocaleString()} output tokens`
            : "Start voice sends audio and requested sources to OpenAI. API charges apply."}
        </span>
      </div>
      <dialog
        ref={dialog}
        className="tools-dialog"
        aria-labelledby="tools-title"
        onCancel={closeTools}
        onClose={closeTools}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const bounds = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < bounds.left ||
              e.clientX > bounds.right ||
              e.clientY < bounds.top ||
              e.clientY > bounds.bottom
            )
              closeTools();
          }
        }}
      >
        <div className="tools-header">
          <div>
            <span className="eyebrow">COMPANION OPTIONS</span>
            <h2 id="tools-title">Book tools</h2>
          </div>
          <button
            autoFocus
            className="icon-button"
            aria-label="Close companion options"
            onClick={closeTools}
          >
            <X size={19} />
          </button>
        </div>
        <Research
          doc={doc}
          navigate={(page) => {
            closeTools();
            navigate(page);
          }}
          onActivity={append}
        />
      </dialog>
    </div>
  );
}

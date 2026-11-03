import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  FileImage,
  MessageCircle,
  MicOff,
  Search,
  X,
} from "lucide-react";
import type { PdfDocument } from "../documents/pdf";
import type { Source } from "../documents/model";
import Research from "./Research";

export type ActivityDraft = {
  kind: "context" | "request" | "lookup" | "error";
  title: string;
  detail: string;
  sources?: Source[];
};
type Activity = ActivityDraft & { id: string };

function SourcePreview({
  source,
  doc,
  navigate,
}: {
  source: Source;
  doc: PdfDocument;
  navigate: (page: number) => void;
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
          {source.kind === "image" ? "Image" : "Text"}
        </span>
      </summary>
      <div className="history-source-body">
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
          {source.clipped ? "Clipped excerpt. " : ""}Prepared locally · not sent
          to AI
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
  const append = useCallback((draft: ActivityDraft) => {
    const event = { ...draft, id: crypto.randomUUID() };
    setEvents((previous) => {
      // Keep a small local timeline and at most six image blobs. Never persist it.
      let images = 0;
      return [...previous, event]
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
          <h2>Room for a conversation.</h2>
          <p>
            Your questions, replies, and shared pages will appear here when
            voice is connected.
          </p>
          <p className="intro-note">
            For now, follow your local reading and lookups below. Nothing has
            been sent to AI.
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
      <div className="voice-dock">
        <div className="reading-context" title={contextState}>
          <span className="status-dot" />
          {contextPage
            ? `With you on PDF page ${contextPage}`
            : "Opening your page…"}
        </div>
        <div
          className="voice-orb"
          role="img"
          aria-label="Voice companion idle"
        />
        <h3>A conversation, beside your book.</h3>
        <p id="voice-availability">
          Voice isn’t connected yet. Your microphone is off.
        </p>
        <div className="voice-controls">
          <button
            className="voice-mute"
            aria-label="Microphone off"
            disabled
            aria-describedby="voice-availability"
          >
            <MicOff size={19} />
          </button>
          <button
            className="start-voice"
            disabled
            aria-describedby="voice-availability"
          >
            Start voice
          </button>
        </div>
        <span className="dock-note">
          Page images stay local until a connected conversation needs them.
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

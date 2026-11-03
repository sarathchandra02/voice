import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BookOpen,
  FileUp,
  ShieldCheck,
  PanelRightClose,
  PanelRightOpen,
  X,
  ArrowLeft,
  Headphones,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";
import type { PdfDocument } from "./documents/pdf";
import Reader from "./components/Reader";
import Companion from "./components/Companion";
import ConnectionSettings from "./components/ConnectionSettings";
import { LIMITS, type Source } from "./documents/model";

export default function App() {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const liveDoc = useRef<PdfDocument | null>(null);
  const opening = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [backPage, setBackPage] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [readerWidth, setReaderWidth] = useState(60);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [preparedSource, setPreparedSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [contextState, setContextState] = useState(
    "Preparing reading context…",
  );
  const acknowledged = useCallback(
    (page: number | null) => setRenderedPage(page),
    [],
  );
  function clear() {
    opening.current?.abort();
    liveDoc.current?.dispose();
    liveDoc.current = null;
    setDoc(null);
    setPreparedSource(null);
    setToolsOpen(false);
    setPage(1);
    setRenderedPage(null);
    setBackPage(null);
    setLoading(false);
    setError("");
  }
  async function open(file: File) {
    clear();
    const abort = new AbortController();
    opening.current = abort;
    setLoading(true);
    try {
      const { PdfDocument } = await import("./documents/pdf");
      abort.signal.throwIfAborted();
      const next = await PdfDocument.open(file, abort.signal);
      if (abort.signal.aborted) {
        next.dispose();
        return;
      }
      liveDoc.current = next;
      setDoc(next);
      setLoading(false);
      void next.startIndex();
    } catch (error) {
      if (!abort.signal.aborted) {
        setError((error as Error).message || "This PDF could not be opened.");
        setLoading(false);
      }
    }
  }
  useEffect(
    () => () => {
      opening.current?.abort();
      liveDoc.current?.dispose();
    },
    [],
  );
  useEffect(() => {
    if (!doc || renderedPage !== page) {
      setContextState("Waiting for the current page to render.");
      return;
    }
    const abort = new AbortController();
    setContextState(
      "Page located. Its image will be prepared when you settle here.",
    );
    const timer = setTimeout(() => {
      doc
        .image(page, abort.signal)
        .then((source) => {
          if (!abort.signal.aborted) {
            setPreparedSource(source);
            setContextState(
              "Page image ready locally for a future conversation.",
            );
          }
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setContextState(
              "Page located. Automatic image preparation was unavailable; try View image.",
            );
        });
    }, 2500);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [doc, page, renderedPage]);
  const researchNavigate = (target: number) => {
    setBackPage(page);
    setPage(target);
  };
  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.parentElement!.getBoundingClientRect();
    setReaderWidth(
      Math.max(
        45,
        Math.min(75, ((event.clientX - box.left) / box.width) * 100),
      ),
    );
  }
  return (
    <div
      className={`app ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <header className="topbar">
        <a className="brand" href="/" aria-label="Margin home">
          <span className="brand-icon">m</span>
          <span>
            margin<em> / studio</em>
          </span>
        </a>
        <div className="active-document">
          {doc ? (
            <>
              <span className="status-dot" />
              <span title={doc.name}>{doc.name}</span>
            </>
          ) : (
            <span>Your reading space</span>
          )}
        </div>
        <div className="topbar-actions">
          <div className="privacy">
            <ShieldCheck size={14} />
            <span>Browser workspace</span>
          </div>
          {doc && (
            <div className="document-actions">
              {backPage !== null && (
                <button
                  className="text-button"
                  onClick={() => {
                    setPage(backPage);
                    setBackPage(null);
                  }}
                >
                  <ArrowLeft size={14} />
                  Back to reading
                </button>
              )}
              <button onClick={() => picker.current?.click()}>
                <FileUp size={15} />
                Replace
              </button>
              <button
                className="icon-button"
                onClick={clear}
                aria-label="Clear document"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <ConnectionSettings />
        </div>
      </header>
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Open PDF file"
        className="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void open(file);
        }}
      />
      {dragging && <div className="drop-overlay">Drop your PDF to open it</div>}
      {!doc ? (
        <main className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">YOUR DOCUMENT, WITH ROOM TO THINK</span>
            <h1>
              Stay on the page.
              <br />
              <em>Follow your curiosity.</em>
            </h1>
            <p>
              Read a little closer. Explore another chapter.
              <br />
              Keep your place while the bigger picture comes together.
            </p>
          </div>
          <button
            className="upload-card"
            onClick={() => picker.current?.click()}
            disabled={loading}
          >
            <span className="upload-icon">
              <FileUp size={27} />
            </span>
            <strong>{loading ? "Opening your document…" : "Open a PDF"}</strong>
            <span>Choose a file or drop it here</span>
            <small>
              Up to {LIMITS.fileBytes / 1_000_000} MB ·{" "}
              {LIMITS.pages.toLocaleString("en-US")} pages · Excel support is on
              the way
            </small>
            <span className="upload-arrow">
              <ArrowRight size={20} />
            </span>
          </button>
          {loading && (
            <button className="text-button" onClick={clear}>
              Cancel opening
            </button>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="welcome-details">
            <div>
              <BookOpen size={19} />
              <h3>Your place is yours</h3>
              <p>
                Explore sources in a separate panel without turning your page.
              </p>
            </div>
            <div>
              <ShieldCheck size={19} />
              <h3>Local from the start</h3>
              <p>
                Your PDF is read and indexed in this browser. No account needed
                for local reading.
              </p>
            </div>
            <div>
              <Headphones size={19} />
              <h3>Talk through your book</h3>
              <p>
                Connect your OpenAI key to discuss pages and explore sources by
                voice.
              </p>
            </div>
          </div>
          <footer>
            READER PREVIEW <span>01 / LOCAL READING & RESEARCH</span>
          </footer>
        </main>
      ) : (
        <main className="workspace">
          <div
            className={`split ${collapsed ? "collapsed" : ""}`}
            style={{ "--reader-width": `${readerWidth}%` } as CSSProperties}
          >
            <Reader
              key={doc.id}
              doc={doc}
              page={page}
              navigate={setPage}
              onRendered={acknowledged}
            />
            <div
              className="divider"
              role="separator"
              aria-label="Resize reader"
              aria-orientation="vertical"
              aria-valuenow={readerWidth}
              aria-valuemin={45}
              aria-valuemax={75}
              tabIndex={0}
              onPointerDown={(e) =>
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              onPointerMove={resize}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setReaderWidth((width) =>
                    Math.max(
                      45,
                      Math.min(75, width + (e.key === "ArrowRight" ? 2 : -2)),
                    ),
                  );
                }
              }}
            >
              <span />
            </div>
            <aside className="companion" aria-label="Research companion">
              <div className="companion-header">
                <div className="companion-title">
                  <span className="eyebrow">THINK OUT LOUD</span>
                  <h2>Follow the thought.</h2>
                </div>
                <div className="companion-header-actions">
                  {!collapsed && (
                    <button
                      className="icon-button"
                      aria-label="Companion options"
                      aria-haspopup="dialog"
                      aria-expanded={toolsOpen}
                      onClick={() => setToolsOpen(true)}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={
                      collapsed ? "Expand companion" : "Collapse companion"
                    }
                    onClick={() => setCollapsed((value) => !value)}
                  >
                    {collapsed ? (
                      <PanelRightOpen size={18} />
                    ) : (
                      <PanelRightClose size={18} />
                    )}
                  </button>
                </div>
              </div>
              <div className="companion-content" hidden={collapsed}>
                <Companion
                  key={doc.id}
                  doc={doc}
                  navigate={researchNavigate}
                  contextPage={renderedPage === page ? renderedPage : null}
                  contextState={contextState}
                  preparedSource={preparedSource}
                  toolsOpen={toolsOpen}
                  closeTools={() => setToolsOpen(false)}
                />
              </div>
              {collapsed && <span className="collapsed-label">COMPANION</span>}
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>
              <span className="status-dot" />
              Reader preview
            </span>
            <span>Local PDF tools · OpenAI voice available</span>
          </footer>
        </main>
      )}
    </div>
  );
}

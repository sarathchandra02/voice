import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Headphones,
  KeyRound,
  Library,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import "./style.css";

type Design = "air" | "focus" | "studio";
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  source?: boolean;
};
const designs: { id: Design; name: string; description: string }[] = [
  { id: "air", name: "Air", description: "Quiet, open, conversation first." },
  {
    id: "focus",
    name: "Focus",
    description: "An immersive evening workspace.",
  },
  {
    id: "studio",
    name: "Studio",
    description: "A fluid, light-filled reading space.",
  },
];
const initialMessages: Message[] = [
  {
    id: 1,
    role: "user",
    text: "Does this connect to the diagram in chapter two?",
  },
  {
    id: 2,
    role: "assistant",
    text: "It does. Both show the point where two constraints agree. In chapter two, you saw it geometrically. Here, you’re finding the same point with equations.",
    source: true,
  },
];
function stored(name: string) {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
function remember(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* Offline private windows may disallow storage. */
  }
}
function initialDesign(): Design {
  const hash = location.hash.slice(1);
  return designs.some((d) => d.id === hash) ? (hash as Design) : "air";
}

function Diagram({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "diagram mini-diagram" : "diagram"}
      viewBox="0 0 420 200"
      role="img"
      aria-label="Sample graph showing two lines meeting at a point"
    >
      <defs>
        <pattern
          id={small ? "grid-small" : "grid-large"}
          width="35"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 35 0 L 0 0 0 32"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".09"
          />
        </pattern>
      </defs>
      <rect
        width="420"
        height="200"
        fill={`url(#${small ? "grid-small" : "grid-large"})`}
      />
      <path
        d="M35 174H397M70 190V15"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".35"
      />
      <path
        d="M85 164L350 32"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.8"
      />
      <path
        d="M85 54L350 162"
        fill="none"
        stroke="var(--second-line)"
        strokeWidth="2.8"
      />
      <circle cx="207" cy="103" r="17" fill="var(--accent)" opacity=".09" />
      <circle
        cx="207"
        cy="103"
        r="5"
        fill="var(--accent)"
        stroke="var(--paper)"
        strokeWidth="2"
      />
      <text
        x="224"
        y="89"
        fontSize="12"
        fill="currentColor"
        fontFamily="sans-serif"
      >
        One shared solution
      </text>
      <text
        x="360"
        y="35"
        fontSize="12"
        fill="var(--accent)"
        fontFamily="serif"
      >
        y = 2x + 1
      </text>
      <text
        x="356"
        y="163"
        fontSize="12"
        fill="var(--second-line)"
        fontFamily="serif"
      >
        y = −x + 7
      </text>
    </svg>
  );
}
function Orb({
  active = false,
  small = false,
}: {
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`orb ${active ? "active" : ""} ${small ? "small" : ""}`}
      role="img"
      aria-label={active ? "Simulated voice bubble" : "Voice bubble"}
    >
      <i />
      <b />
      <span />
    </div>
  );
}

function App() {
  const [design, setDesign] = useState<Design>(initialDesign);
  const [page, setPage] = useState(93);
  const [zoom, setZoom] = useState(100);
  const [dialog, setDialog] = useState<"settings" | "tools" | null>(null);
  const [configured, setConfigured] = useState(
    () => stored("margin-mock-connected") === "yes",
  );
  const [key, setKey] = useState("");
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [setupRequested, setSetupRequested] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const toolInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.dataset.design = design;
    location.hash = design;
  }, [design]);
  useEffect(() => {
    const onHash = () => setDesign(initialDesign());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal();
    if (!dialog && modal.current?.open) modal.current.close();
  }, [dialog]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function closeDialog() {
    setDialog(null);
    setKey("");
    setSetupRequested(false);
  }
  function choose(next: Design) {
    setDesign(next);
    setNotice("");
    setSourceOpen(false);
  }
  function startVoice() {
    if (!configured) {
      setSetupRequested(true);
      setDialog("settings");
      return;
    }
    setActive(true);
    setMuted(false);
    setNotice(
      "Voice preview started. No microphone or AI connection is active.",
    );
  }
  function saveDemo() {
    remember("margin-mock-connected", "yes");
    setConfigured(true);
    setKey("");
    closeDialog();
    setNotice("Demo connection saved. Open settings any time to change it.");
  }
  function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setMessages((items) => [
      ...items,
      { id: Date.now(), role: "user", text },
      {
        id: Date.now() + 1,
        role: "assistant",
        text: "This is an interactive design preview. Your source-grounded answer would appear here, with the pages used to explain it.",
      },
    ]);
    requestAnimationFrame(() => {
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
    });
  }
  function backgroundLookup() {
    setSourceOpen(true);
    closeDialog();
    setNotice("Sample lookup complete. Your reading position has not moved.");
  }
  return (
    <div className={`mock ${design}`}>
      <div className="design-bar">
        <span className="lab-label">
          <span /> DESIGN LAB
        </span>
        <nav aria-label="Choose a design">
          {designs.map((d, i) => (
            <button
              key={d.id}
              aria-pressed={design === d.id}
              onClick={() => choose(d.id)}
            >
              <small>0{i + 1}</small>
              {d.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="app-frame">
        {design === "focus" && (
          <aside className="focus-rail">
            <button
              className="logo-button"
              aria-label="Focus home"
              onClick={() => setNotice("You’re in the Focus design preview.")}
            >
              <AudioLines size={25} />
            </button>
            <button aria-label="Library" onClick={() => setDialog("tools")}>
              <Library size={20} />
            </button>
            <button
              className="rail-selected"
              aria-label="Current book"
              onClick={() => setPage(93)}
            >
              <BookOpen size={20} />
            </button>
            <button
              aria-label="Search this book"
              onClick={() => {
                setDialog("tools");
                setTimeout(() => toolInput.current?.focus(), 100);
              }}
            >
              <Search size={19} />
            </button>
            <div className="rail-spacer" />
            <button
              aria-label="Connection settings"
              title="Connection settings"
              onClick={() => setDialog("settings")}
            >
              <Settings2 size={19} />
            </button>
            <span className="avatar">S</span>
          </aside>
        )}
        <div className="main-frame">
          <header className="app-header">
            <div className="wordmark">
              {design === "studio" ? (
                <span className="studio-mark">m</span>
              ) : design === "air" ? (
                <span className="air-mark">
                  <AudioLines size={19} />
                </span>
              ) : null}
              <span>margin{design === "studio" && <em> / studio</em>}</span>
            </div>
            <div className="header-document">
              <span className="header-dot" />
              The beauty of linear algebra
              <ChevronDown size={13} />
            </div>
            <div className="header-right">
              <span className="local-label">
                <ShieldCheck size={13} />
                On your device
              </span>
              <button
                className={`icon ${design === "focus" ? "focus-mobile-settings" : ""}`}
                aria-label="Connection settings"
                title="Connection settings"
                onClick={() => setDialog("settings")}
              >
                <Settings2 size={18} />
              </button>
              {design === "studio" && <span className="avatar">S</span>}
            </div>
          </header>
          <main className="reading-layout">
            <section className="reader-pane" aria-label="Sample book reader">
              <div className="reader-top">
                <div className="reader-breadcrumb">
                  <button
                    className="icon"
                    aria-label="Book contents"
                    onClick={() => setDialog("tools")}
                  >
                    <PanelLeft size={16} />
                  </button>
                  <span>
                    {design === "studio" ? "YOUR READING SPACE" : "CHAPTER 04"}
                  </span>
                  <span className="breadcrumb-title">Systems of equations</span>
                </div>
                <div className="reader-actions">
                  <button
                    className="icon"
                    aria-label="Reduce sample zoom"
                    onClick={() => setZoom((z) => Math.max(80, z - 10))}
                  >
                    −
                  </button>
                  <span>{zoom}%</span>
                  <button
                    className="icon"
                    aria-label="Increase sample zoom"
                    onClick={() => setZoom((z) => Math.min(140, z + 10))}
                  >
                    +
                  </button>
                  <button
                    className="icon"
                    aria-label="Fit sample page"
                    onClick={() => setZoom(100)}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
              <div className="paper-scroll">
                <article
                  className="book-paper"
                  style={{ fontSize: `${zoom}%` }}
                >
                  <div className="paper-running">
                    <span>THE BEAUTY OF LINEAR ALGEBRA</span>
                    <span>04</span>
                  </div>
                  <span className="chapter-kicker">A MEETING OF IDEAS</span>
                  <h1>
                    Finding common
                    <br />
                    ground.
                  </h1>
                  <p className="paper-lede">
                    What happens when two equations tell
                    <br className="desktop-break" /> different parts of the same
                    story?
                  </p>
                  <div className="paper-rule" />
                  <p>
                    Think of an equation as a constraint: a description of what
                    is possible. One line gives us infinitely many points. A
                    second line asks a more interesting question — which of
                    those points can satisfy both?
                  </p>
                  <p>
                    The answer lives at their intersection. A system of
                    equations gives us a language for finding this{" "}
                    <mark>shared solution</mark>, whether we are looking at a
                    graph or working through the algebra.
                  </p>
                  <div className="figure-block">
                    <Diagram />
                    <div className="figure-caption">
                      <strong>FIGURE 4.3</strong>
                      <span>Two perspectives. One point of agreement.</span>
                    </div>
                  </div>
                  <h2>From a picture to a principle</h2>
                  <p>
                    In the previous chapter, we met this idea visually. Now we
                    can describe it precisely: the solution belongs to both
                    equations at once.
                  </p>
                  <div className="paper-page">
                    <span>LINEAR SYSTEMS</span>
                    <b>{page}</b>
                  </div>
                </article>
              </div>
              <footer className="reader-bottom">
                <span className="page-count">
                  Book page {page}
                  <span> · PDF {page + 12} of 248</span>
                </span>
                <div className="page-stepper">
                  <button
                    className="icon"
                    aria-label="Previous sample page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    {page} <small>/ 236</small>
                  </span>
                  <button
                    className="icon"
                    aria-label="Next sample page"
                    disabled={page >= 236}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <span className="reading-progress">38% read</span>
              </footer>
            </section>
            <section className="voice-pane" aria-label="Sample voice companion">
              <div className="conversation-top">
                <div>
                  <span className="tiny-kicker">
                    {design === "studio" ? "THINK OUT LOUD" : "YOUR COMPANION"}
                  </span>
                  <h2>
                    {design === "focus"
                      ? "A space to think."
                      : design === "studio"
                        ? "Follow the thought."
                        : "Let’s make sense of it."}
                  </h2>
                </div>
                <button
                  className="icon"
                  aria-label="Book tools and options"
                  title="Book tools and options"
                  onClick={() => setDialog("tools")}
                >
                  <MoreHorizontal size={21} />
                </button>
              </div>
              <div
                className="conversation-scroll"
                ref={log}
                role="log"
                aria-label="Sample conversation history"
              >
                <div className="session-divider">
                  <span />
                  Sample conversation
                  <span />
                </div>
                <div className="context-event">
                  <FileText size={13} />
                  <span>Reading with you on page {page}</span>
                  <span className="context-state">Local</span>
                </div>
                {messages.map((m) => (
                  <div key={m.id} className={`message ${m.role}`}>
                    <span className="message-author">
                      {m.role === "user" ? "You" : "Margin"}
                    </span>
                    <p>{m.text}</p>
                    {m.source && (
                      <>
                        <button
                          className="source-pill"
                          aria-expanded={sourceOpen}
                          onClick={() => setSourceOpen((v) => !v)}
                        >
                          <BookOpen size={13} />
                          <span>Chapter 2 · Figure 2.3</span>
                          <ChevronDown size={12} />
                        </button>
                        {sourceOpen && (
                          <div className="source-preview">
                            <Diagram small />
                            <div>
                              <span>Sample source · book page 37</span>
                              <button
                                className="icon"
                                aria-label="Open sample source in reader"
                                onClick={() => {
                                  setPage(37);
                                  setNotice(
                                    "Opened the sample source. Use the page controls to return.",
                                  );
                                }}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                <div className="lookup-event">
                  <Check size={12} />
                  <span>
                    Referenced chapter 2. Your reading position stayed here.
                  </span>
                </div>
              </div>
              <div className="voice-stage">
                <div className="voice-stage-inner">
                  <Orb active={active && !muted} />
                  <div className="voice-stage-copy">
                    <span className="voice-status">
                      {active
                        ? muted
                          ? "Paused · preview"
                          : "Listening · preview"
                        : design === "studio"
                          ? "Ideas sound better out loud."
                          : "Your next question starts here."}
                    </span>
                    <p>
                      {active
                        ? "Simulated session · microphone off"
                        : design === "focus"
                          ? "Keep reading. Ask anything."
                          : "Stay in the book. Follow your curiosity."}
                    </p>
                  </div>
                </div>
                <div className="voice-buttons">
                  {active ? (
                    <>
                      <button
                        className="round-control"
                        aria-label={muted ? "Resume preview" : "Mute preview"}
                        onClick={() => setMuted((v) => !v)}
                      >
                        {muted ? <MicOff size={19} /> : <Mic size={19} />}
                      </button>
                      <button
                        className="main-voice-button"
                        onClick={() => {
                          setActive(false);
                          setMuted(false);
                        }}
                      >
                        <Square size={12} fill="currentColor" />
                        End preview
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="round-control"
                        aria-label="Show typed input"
                        onClick={() =>
                          document.getElementById("mock-message")?.focus()
                        }
                      >
                        <MessageCircle size={18} />
                      </button>
                      <button
                        className="main-voice-button"
                        onClick={startVoice}
                      >
                        <AudioLines size={18} />
                        Start talking
                      </button>
                    </>
                  )}
                </div>
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  id="mock-message"
                  aria-label="Type a sample message"
                  placeholder={
                    design === "focus"
                      ? "Or put a thought into words…"
                      : "Or type a thought…"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={500}
                />
                <button
                  aria-label="Send sample message"
                  disabled={!input.trim()}
                >
                  <ArrowUp size={17} />
                </button>
              </form>
              <div className="companion-footnote">
                {design === "studio"
                  ? "Your book. Your pace. Your space."
                  : "Only relevant pages join the conversation."}
              </div>
            </section>
          </main>
        </div>
      </div>
      <div className="design-caption">
        <span>
          <b>{designs.find((d) => d.id === design)!.name}</b> —{" "}
          {designs.find((d) => d.id === design)!.description}
        </span>
        <span>
          Interactive mock · API key setup lives in <Settings2 size={11} />
        </span>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
          <button
            className="icon"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        className="settings-dialog"
        ref={modal}
        onCancel={closeDialog}
        onClose={() => {
          if (dialog) closeDialog();
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-top">
          <span className="dialog-icon">
            {dialog === "settings" ? (
              <KeyRound size={20} />
            ) : (
              <BookOpen size={20} />
            )}
          </span>
          <button
            className="icon"
            aria-label="Close settings or tools"
            onClick={closeDialog}
          >
            <X size={20} />
          </button>
        </div>
        {dialog === "settings" ? (
          <>
            <span className="tiny-kicker">
              {setupRequested ? "ONE-TIME SETUP" : "YOUR CONNECTION"}
            </span>
            <h2 id="dialog-title">
              {configured
                ? "Make yourself at home."
                : "A voice for your reading."}
            </h2>
            <p className="dialog-description">
              {configured
                ? "Your connection is set up for this preview. Update it here whenever you need."
                : "Connect your own OpenAI key once. Then come back to your book, not a setup screen."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveDemo();
              }}
            >
              <label>
                OpenAI API key
                <div className="key-field">
                  <KeyRound size={15} />
                  <input
                    aria-label="OpenAI API key preview"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      configured
                        ? "Demo key configured — enter a replacement"
                        : "Use a placeholder for this mock"
                    }
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    maxLength={256}
                  />
                  {configured && <Check size={15} />}
                </div>
              </label>
              <div className="settings-line">
                <span>Voice model</span>
                <span>
                  OpenAI Realtime <small>To be verified</small>
                </span>
              </div>
              <div className="settings-line">
                <span>Documents & reading state</span>
                <span>This browser</span>
              </div>
              <p className="preview-disclosure">
                Design preview only. Enter a dummy value. No API key is saved or
                sent; only a demo-setup flag is remembered.
              </p>
              <button className="save-button" type="submit">
                {configured ? "Update demo connection" : "Use demo connection"}
                <ArrowRight size={16} />
              </button>
            </form>
            {configured && (
              <button
                className="forget-button"
                onClick={() => {
                  remember("margin-mock-connected", "no");
                  setConfigured(false);
                  setActive(false);
                  setKey("");
                }}
              >
                Forget demo connection
              </button>
            )}
          </>
        ) : (
          <>
            <span className="tiny-kicker">BEHIND THE CONVERSATION</span>
            <h2 id="dialog-title">Explore your book.</h2>
            <p className="dialog-description">
              Find a connection without losing your place.
            </p>
            <div className="tool-search">
              <Search size={17} />
              <input
                ref={toolInput}
                aria-label="Search sample book"
                placeholder="A chapter, concept, or diagram…"
                value={toolQuery}
                onChange={(e) => setToolQuery(e.target.value)}
              />
            </div>
            <button className="tool-result" onClick={backgroundLookup}>
              <span className="tool-result-icon">
                <BookOpen size={18} />
              </span>
              <span>
                <strong>
                  {toolQuery
                    ? `Sample result for “${toolQuery.slice(0, 50)}”`
                    : "The geometry of an equation"}
                </strong>
                <small>Chapter 2 · Figure 2.3 · Page 37</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button
              className="tool-result"
              onClick={() => {
                setNotice(
                  "Sample book: 248 PDF pages, 236 printed pages. Chapter and concept indexes belong here.",
                );
                closeDialog();
              }}
            >
              <span className="tool-result-icon">
                <Library size={18} />
              </span>
              <span>
                <strong>About this book</strong>
                <small>Chapters, page map & concept index</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <p className="preview-disclosure">
              Sample lookups only. Your actual document reader and retrieval
              implementation are unchanged.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

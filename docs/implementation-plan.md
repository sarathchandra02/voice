# PDF and Excel Voice Companion — implementation plan

## Goal and current state

Build a reader-first application where a person opens a PDF or workbook locally and has a continuous voice conversation grounded in its contents. The companion can retrieve off-screen pages, inspect actual figure images, navigate to sources, and calculate over workbook ranges.

The selected repository, `sarathchandra02/voice`, was verified empty. This plan is for a fresh implementation there. The uploaded specification is the product reference. Its appendix describes a separate prototype; that application's deployment, source, ownership, ledger, and reported outcomes have not been verified in this workspace. They are not evidence of implemented functionality or authorization to use an existing budget.

Current delivery: the first PDF reader/research increment has been implemented. See README.md and validation.md for the precise verified subset and remaining work. Excel, voice, and server/provider integration are still planned. No provider calls or production deployment have been made.

## Technical decisions

- **Browser:** React and TypeScript with Vite. Separate reader, document adapters, retrieval, sources, audio, and conversation state modules.
- **PDF:** PDF.js with bundled worker and assets. Render actual pages and selectable text; implement direct page access independently of indexing. Disable active document features and automatic external navigation.
- **Workbooks:** worker-isolated parser supporting XLSX and a precisely documented binary XLS variant. Evaluate the current official SheetJS distribution, maintenance, license, and security fixes before pinning it. Do not adopt an outdated package simply because it is available from the default registry.
- **Server:** Node.js with a typed HTTP/WebSocket boundary. Same-origin authenticated access, strict event validation, and server-only provider configuration.
- **Durability:** SQLite for initial single-server development, with transactional leases and an append-only reservation ledger. Keep a storage interface so a deployment requiring multiple server instances can use a suitable shared transactional database.
- **Voice:** begin with server-mediated WebSockets so every model response remains subject to admission. Browser capture and playback use dedicated audio modules and bounded queues. Treat acoustic interruption as a measured engineering requirement; do not assume a simple volume threshold is sufficient.
- **Testing:** unit and integration tests plus Playwright browser checks using synthetic documents and a provider simulator that rejects real network calls. Physical-device tests are a separate release gate.
- **Provider:** choose and pin the model and protocol only after checking current official capabilities, schemas, pricing, and account access. Model names and rates in the attachment are reference claims, not verified configuration.

## Core architecture: human reader and assistant research interface

The visible viewer provides immediate reading context, but is not the boundary of the assistant's access. Both interfaces use one local document service, one page map, and the same source identities. The assistant's research interface is a set of document tools with independent retrieval state, not another visible browser window or a duplicate copy of the whole book.

### Shared document service and page map

Represent physical PDF pages, printed page labels, and chapter locations separately. Prefer reliable PDF labels and outline metadata; supplement with table-of-contents entries, extracted headings, and explicitly verified user corrections. Record provenance and uncertainty for inferred mappings. Support Roman numerals, missing or repeated labels, chapter-relative numbering, and piecewise offsets rather than assuming one global offset.

Resolve a human or assistant request through the same page resolver. Present both book and physical page numbers where they differ. An ambiguous printed label returns candidates rather than silently becoming a physical page number. Corrections invalidate affected chapter/figure references and stale results. Direct physical-page access remains available before indexing finishes.

### Human reader and current-reading context

The human reader owns page, viewport, zoom, scroll, and selection. Maintain a versioned current-reading context locally as navigation occurs, including the active document, page mapping, visible page set, and selected passage when present. Track reading context separately from evidence already delivered to the provider; locally available content is not automatically something the model has inspected.

After roughly 2–3 seconds on a settled page, prepare a bounded page image locally from the PDF renderer. Coalesce rapid page changes, cancel obsolete preparation, and deduplicate identical evidence. Never capture the surrounding application or desktop. Do not treat partial scrolling within one page as a reason to repeatedly send the entire page.

During an active conversation, a question can use the latest reading context immediately and request the matching prepared image when visual evidence is needed. If preparation is incomplete, obtain the correct page on demand rather than substituting a stale image. An explicit page/figure request bypasses the dwell timer. Settling on a page alone does not create a model response or an unconditional upload. Automatic provider prefetch, if later added, requires explicit product disclosure and bounded context/cost handling; it is not implied by local preparation.

At the start of each question, snapshot its reading context so "this diagram" has a stable referent even if the user later scrolls. New questions use the newer context. Show which source has actually been supplied to the assistant, including pending or failed states. Hidden companion controls must not erase reading context; hiding the application still stops capture as specified.

### Assistant research tools across the entire book

Provide the following capabilities through typed, bounded, cancellable tools:

| Capability | Behavior |
| --- | --- |
| Current-reading context | Obtain the question's page/selection context and, when needed, the actual page image. |
| Chapter discovery | List or find chapters using outline, contents, headings, and indexed text; return source ranges and mapping uncertainty. |
| Text search | Search the whole indexed book or an identified chapter; return exact excerpts, sources, and honest coverage. |
| Page resolution and direct read | Resolve printed/physical references and retrieve a specified page independently of index progress. |
| Figure discovery | Find candidates by caption, label, chapter, description, or order, then inspect actual page images/crops to verify them. |
| Bounded sequential exploration | Read or inspect successive pages within an explicit range when indexes are missing or insufficient; return a continuation cursor and checked/unreadable/unvisited coverage. |
| Evidence comparison | Keep current-reading evidence and independently retrieved sources available together, with separate identities and citations. |
| Explicit viewer navigation | Move the human reader only for a request to show/open a source; acknowledge success after the matching render. |

Sequential exploration is a fallback, not an unlimited whole-book visual scan. Respect per-turn calls, images, payloads, cancellation, and admission. Each batch records progress so later continuation avoids restarting at page one. A paused search reports what was actually checked; it does not equate missing index matches with absence from the book. Description-based diagram search may require several bounded steps and is not promised to be instantaneous.

Chapter and figure catalogs grow progressively and on demand. Store local metadata and provenance within an explicit resource budget; avoid caching every page image or sending the entire book to the model. A diagram candidate found from text is not yet visually inspected. Prefer local text and metadata to narrow candidates, then inspect relevant images. Do not add paid visual indexing or embeddings implicitly.

### Background lookup without moving the reader

The user's visible reading position and the assistant's retrieved evidence must be independent. If the user is reading one page and asks whether a diagram from a previous chapter relates to the current material, retrieve and inspect both sources without changing the visible page, zoom, selection, or scroll position. Navigation requires an explicit request or clearly implied intent to show a source; a comparison or background lookup alone does not imply navigation.

Support references such as "the third diagram in the systems of equations chapter." Resolve chapter candidates using the PDF outline, table of contents, headings, and available indexed text. Use captions and bounded visual inspection to identify candidate diagrams. Printed figure number three and the third diagram in reading order are different concepts. Ask a concise clarification when the evidence cannot distinguish candidates; never claim to have found a diagram from a keyword match alone.

This promotes chapter and figure discovery into the required retrieval workflow for this use case. A complete precomputed visual catalog is not a prerequisite for opening the book. Progressive discovery must report coverage and respect tool/image budgets; if finding an unlabelled diagram requires more inspection than a turn allows, explain the partial result and offer continuation.

Background page rendering uses independent off-screen resources. It must not trigger foreground page-following, alter the user's current-page context, or overwrite the reading position. Bind a comparison to the current passage/page at the time of the question and to the independently retrieved figure. Present source references that the user can optionally open.

Acceptance scenario: while viewing a later page at a chosen zoom and scroll position, ask about the third diagram in a named earlier chapter. Locate and visually inspect the correct diagram, compare it with the question's current-page context, and expose both sources. Verify the reader position remains unchanged throughout. Also test ambiguous diagram numbering, missing chapter outlines, incomplete indexing, and user navigation during retrieval.

### Required architecture acceptance checks

- Human and assistant requests resolve through the same printed-to-physical page mapping, including Roman front matter, chapter resets, duplicate labels, and corrected offsets.
- Rapid Next clicks produce no cascade of evidence uploads or model responses. Local preparation resolves to the latest settled page, and an immediate question obtains the correct page without waiting for the dwell timer.
- The assistant can find a chapter, inspect a diagram, and compare it with the current page while the visible reading position remains unchanged.
- A book without a useful outline or caption catalog supports bounded sequential inspection with an accurate continuation state and incomplete-coverage disclosure.
- Background reads never masquerade as human page changes or trigger the page-following mechanism. Foreground navigation remains responsive while background work is scheduled within the shared resource limits.
- Document replacement cancels both interfaces' work and invalidates all sources, mappings, continuation cursors, and queued provider evidence from the old revision.
- Automated tests cover tool behavior offline. Live diagram identification and contextual comparison require separate model-answer evidence, including held-out figures and image-blocked controls.

## Build sequence

### 1. Project foundation and local reader

Create the application, development scripts, lockfile, architecture notes, and test harness. Build the responsive reader/companion shell, keyboard-operable divider, collapse behavior, file opening, replace, and clear.

Add PDF rendering, physical page navigation, printed-label mapping, zoom, text selection, and cancellation. Add the workbook worker, sheet tabs, virtualized grid, typed values, formula/cache distinctions, merged cells, and visibility metadata.

Establish the shared document service and separate human-view/assistant-research state here. Implement versioned reading context and local settled-page preparation before provider integration.

The reader works without a provider connection. The companion clearly reports that voice is not configured; it does not simulate an AI answer.

**Exit evidence:** supported synthetic documents render; local reading sends no document content; resize and collapse preserve position; malformed/oversized documents fail safely; replacement cannot display late results from the old document.

### 2. Whole-document retrieval and trustworthy sources

Implement progressive bounded PDF indexing with pause/resume and honest coverage. Direct reads and image rendering bypass incomplete indexing. Add bounded crops with image identity, hash, size, and dimensions.

Implement chapter discovery, progressive figure candidates, and bounded sequential exploration through the independent assistant research interface. Include the architecture acceptance checks above in this milestone; chapter/diagram lookup is required scope, not a later convenience feature.

Implement visible-workbook search, exact range reads, and deterministic count/sum/min/max/mean. Exclude hidden cells and nonnumeric values by default, report exclusions, and distinguish cached formula values and dates. Do not evaluate formulas or external connections.

Bind all work and sources to document, revision, session, turn, and request. A source is registered only after retrieval. Navigation succeeds only after the viewer acknowledges the matching render. Include a return-to-reading-position action.

**Exit evidence:** reader tests R01–R12 and workbook tests X01–X08 from the specification; off-screen retrieval during partial indexing; stale-source rejection; image extraction and cancellation tests. These checks establish retrieval, not model visual understanding.

### 3. Conversation lifecycle and audio without paid inference

Implement the explicit voice state machine, start-once capture, mute by stopping microphone tracks, immediate local stop, foreground-only behavior, and typed input using the same orchestration contracts.

Implement bounded capture/playback, pre-roll, interruption, correction buffering, playback-progress tracking, and obsolete-turn cancellation. Exercise both interruption during generation and interruption while completed output is still playing.

**Exit evidence:** deterministic protocol/audio tests and browser lifecycle checks. Simulated audio results are labeled separately from real microphone, echo, and speaker behavior.

### 4. Private server and spending admission

Implement owner authentication, secure sessions, origin/CSRF checks, strict request schemas, server-owned settings, payload limits, and redacted diagnostics. Choose the production authentication integration once the hosting target is established; keep provider endpoints unavailable until authentication is configured.

Implement durable session generations, exclusive leases, atomic reservations before every response—including tool continuations—and idempotent terminal handling. Preserve reservations on cancellation or uncertainty. Block new admissions when reconciliation is required. Concurrent tabs and retries must not create additional allowance.

Use explicit test policies offline. Live inference remains disabled until an actual spending policy and credentials are configured; the historical trial amount in the attachment is not a new allowance.

**Exit evidence:** relevant security/accounting tests S01–S14, including concurrent near-limit admission, disconnects, duplicate events, stale generations, and restart persistence.

### 5. Provider integration and complete document conversations

Verify official API behavior, then implement the strict provider adapter and integrate PDF and workbook tools. Validate page-image payloads before forwarding. Expose only document-specific tools, with the specification's bounded retrieval and image limits.

Connect speech and typed requests to the same authentication, evidence, and admission path. Display trusted source references and distinguish retrieved evidence from claim-level support.

**Exit evidence:** offline end-to-end integration first. Live checks require configured access and a separately authorized spending ceiling. Test the page-37 figure workflow using held-out image values and fresh-context image-blocked controls, plus off-screen workbook calculations. Confirm the final answer and terminal accounting—not merely an accepted image or an open page.

### 6. Device validation and release preparation

Test desktop Chromium, physical Android Chrome, and physical iPhone Safari; add desktop Safari or Firefox before claiming broad browser support. Measure latency, interruption, first-word preservation, echo, mute, stop, page hiding, permission failures, and autoplay recovery.

Exercise large and hostile fixtures while measuring responsiveness and memory. Publish a test report with Passed, Failed, Blocked, and Not run outcomes and exact device/test conditions.

Prepare private deployment instructions, durable-storage backup/restore behavior, configuration requirements, and rollback steps. Deployment is a separate action after the release is reviewable.

**Exit evidence:** production build and type checks; passing relevant offline suites; authorized live visual-answer and workbook tests; real-device voice results; no unresolved severe privacy, accounting, access, or document-isolation defects.

## First code increment

The first implementation commit should contain the project scaffold, responsive shell, local PDF loading/rendering/navigation, safe document replacement, and synthetic browser smoke tests. Establish the shared document-service boundary and independent view/research state in that foundation so later tools are never restricted to the rendered page. Include setup instructions and a progress report describing precisely what works.

Follow with workbook parsing/rendering and retrieval in subsequent reviewable commits. This makes the early application useful while preserving the full release requirements. The first increment is not the complete voice companion.

## Constraints to carry into implementation

- Original files remain local. Voice may transmit bounded audio, relevant excerpts, and requested page images after disclosure and deliberate Start.
- Preserve the specification's initial resource limits in one validated configuration module; test limits at parser, worker, broker, and server boundaries.
- Keep document content, raw audio, image bytes, transcripts, and credentials out of persistent diagnostics and the spending ledger.
- Document content and model tool arguments are untrusted. Neither can alter server policy or expand the available tools.
- Use the existing isolated checkout. A separate worktree is unnecessary unless explicitly requested.
- Save and test reusable environment installation/startup instructions once the project has actual dependencies and services.
- Report implemented, verified offline, verified live, and still pending capabilities distinctly.

## Decisions deferred until they affect work

No additional product clarification is needed to begin the local reader. Hosting and production authentication must be chosen before live private access; provider credentials and an explicit spending ceiling are needed before paid inference; physical devices are needed for acoustic acceptance. None blocks the initial offline implementation.

# Voice-model picker — 3 November 2026

Added provider-aware model selection, separate provider key storage, cancelable setup, requested/confirmed model labels, and experimental GPT-Live/Gemini adapters on `experiment/voice-model-picker`. GitHub main remains the earlier stable demo.

Validation: the 32 unit tests passed; the 41-test browser run passed, and the final five-case provider/audio run passed, including two subsequently added cases (43 total browser cases). Checks cover cancel preserving active capture and the selected model, rejecting a provider-key mismatch, separate credential storage, switching terminating capture, actual model selection in request payloads, model reporting, Live backend function continuation, Gemini endpoint isolation, audio/microphone cleanup, and real AudioWorklet PCM frame generation. The production build and formatting checks passed. New provider transports use simulated peers and dummy keys; no paid call or live authentication/acoustic test was performed. See [model-picker behavior and limitations](voice-models.md).

---

# Figure-search experiment — 3 November 2026

The working demo remains on GitHub main at `c3a9cb4`, tagged `demo-working-2026-11-03`. This increment belongs to `experiment/figure-search`; see [branch and rollback policy](experiments.md).

Validation: 32 unit tests and 38 browser tests passed. New checks cover single-digit chapter references, exact decimal identifiers and abbreviations, physical-page-range pagination, captions beyond the old excerpt cutoff, mention-versus-caption ranking, 250-page scan continuation, cancellation and document isolation, extraction gaps, invalid scan ranges, and continued page-text reads. The browser fixture places the actual Figure 9.2 on PDF page 27 / printed page 21, after 2,500 characters, with earlier misleading references. The voice integration sends the matching passage and then the requested image while retaining reader page 1. TypeScript and production build passed.

Browser voice tests use intercepted provider requests and a simulated WebRTC peer. They verify retrieval and orchestration, not the live model's tool choices or visual interpretation. No paid API call was made. OCR and inferred chapter mapping are outside this first experiment.

---

# Voice controls and source transparency — 3 November 2026

The Studio dock now identifies Listening, Thinking, Speaking, and Microphone muted. Stop reply cancels generation, playback, and outstanding lookups while keeping the session open. An obsolete playback-clear event no longer resets the interrupted turn to Thinking. The existing Studio visual design is retained, with touch-sized controls.

Source history now identifies page images versus text excerpts and exposes JPEG dimensions or character counts, the transmitted preview, delivery status, and printed-label/PDF-position mapping. Local book indexing is separate from the bounded excerpts sent on request.

Validation: 23 unit tests and 36 browser tests passed, including interruption during playback and pending source receipt, stale transcript/receipt suppression, preserved microphone connection, and previews matching sent image/text types. TypeScript and production build passed. Browser tests use a simulated WebRTC peer and dummy credentials; no live provider or acoustic-quality claim is made.

---

# Page-delivery repair — 3 November 2026

A user reported working speech followed by “Source delivery unconfirmed” on PDF lookups. Inspection found 37-character client item IDs (`item_` plus a separator-free UUID), exceeding the Realtime input schema's 32-character constraint. The provider simulator previously accepted these IDs. Enforcing the schema constraint reproduced a failed image/text delivery test; the same test passes after using unprefixed 32-character IDs.

Source rejection now correlates to the sending event and exposes only allowlisted error codes and schema fields. Rejection and receipt timeout leave voice connected, do not request continuation from unconfirmed evidence, and allow a new question. Interruptions are identified separately. Page-number questions use the supplied reader context without a needless source lookup.

Validation: 23 unit tests, 34 browser tests, TypeScript/production build, and formatting checks passed. New checks cover schema-valid IDs, safe diagnostics, rejected-source recovery, and receipt timeout/late acknowledgement. No live paid API call was made for this repair; confirmation in the user's browser remains pending. Sites worker error logs were empty, as expected for browser-to-OpenAI traffic.

---

# Validation — Studio Realtime voice

Validated in the managed cloud workspace on 3 November 2026 using synthetic PDFs and dummy credentials. No live OpenAI inference request was made.

| Check | Result | Evidence scope |
| --- | --- | --- |
| Unit suite | Passed, 20 tests | Existing document/index checks plus strict voice tool arguments, question-page snapshots, ambiguous labels, search coverage, image/call budgets, cancellation, and stale-document rejection |
| Reader browser suite | Passed, 17 tests | Existing reader, background lookup, layout, history, settings persistence, and local-only request behavior |
| Voice browser suite | Passed, 15 tests | Simulated WebRTC/auth exchange; transcripts; start/mute/unmute/stop; permission denial and late permission resolution; HTTP/provider errors; question-bound images and off-screen retrieval; receipt confirmation; document replacement; interrupted and duplicate events; typed questions; key removal; tab backgrounding; mobile controls; negotiated image-size limits |
| TypeScript + production build | Passed | Full app and tests type-check and production assets build |
| Formatting and diff checks | Passed | Repository formatter and whitespace checks |
| Visual inspection | Passed for inspected layouts | Desktop 1440 × 1000 and phone-sized 390 × 844 screenshots with synthetic content; the connected phone state used the test simulator |
| Live microphone/account session | Not run | User's key is in their browser, not the cloud workspace. Authentication, browser CORS, real WebRTC transport, acoustic interruption/echo, and phone behavior remain unverified |
| AI visual-answer acceptance | Not run | No paid model call or held-out image interpretation test |

Commands: `npm run test`, `npm run build`, `npm run format:check`, and `TEST_PORT=5182 npm run test:browser`. All 17 reader tests passed in the full browser run; the final voice-only run (`TEST_PORT=5182 npm run test:browser -- tests/voice.browser.test.ts`) passed all 15 voice tests after adding image-size coverage and correcting the test's permission simulator. These tests intercept OpenAI requests and use a simulated peer/microphone: they verify client orchestration, not live provider or acoustic behavior.

See [voice implementation and limitations](voice.md) for endpoint references, lifecycle behavior, evidence delivery, and remaining live checks. No dependencies were added. The audit and screenshot evidence below describe the prior Studio increment and were not rerun as a new security audit.

---

## Previous Studio reader increment

Run in the managed Linux cloud environment on 3 November 2026, using Node.js 24.19.0 and Chromium 154.0.8037.57. Synthetic fixtures only.

| Check | Result | Evidence scope |
| --- | --- | --- |
| Unit suite | Passed, 15 tests | Physical/book label resolution, duplicate/missing/out-of-range references, off-screen keyword lookup, idempotent indexing, source reset, Unicode tokens, bounded result count, term catalog filtering, paginated references beyond the search result window |
| Browser suite | Passed, 17 tests | Local rendering, whole-book keyword retrieval, off-screen page images, explicit source navigation/back, Roman labels, duplicate labels, chapter/next-page research preserving scroll, paused-index direct reads, replace/clear races, invalid files, mobile viewport, settled context, corrected labels, default voice/history layout, options dialog keyboard/focus behavior, source previews, history scroll preservation, About this book page/term indexes, duplicated label preservation and index teardown; local key save/reload/update/remove, no provider request, dialog focus restoration, and blocked-storage recovery |
| TypeScript + production build | Passed | Local application and PDF worker compile; PDF module loads separately from the initial UI |
| Production dependency audit | Passed, 0 reported vulnerabilities | Registry advisory snapshot; not a complete security assessment |
| Visual review | Passed for inspected Studio screenshots | Reader, connection dialog, and mobile layout with a synthetic PDF |
| Physical-device voice tests | Not run | No voice implementation yet |
| AI figure reasoning and comparison | Not run | No provider connection or paid calls |
| Full specification acceptance matrix | Not complete | This is the first increment, not full milestone/release completion |

Browser privacy checks observe requests during local reading and research: no nonlocal HTTP request or non-GET request was made in the tested flow. This establishes the tested path, not universal behavior for every possible PDF.

The fixture has 100 pages, Roman front matter, an outline entry pointing to physical page 37, a known figure, and a unique term on page 95. Additional fixtures cover replacement and duplicated printed labels. Figure numbers and values are extractable in this fixture; it is a rendering fixture, not the held-out raster-only AI reasoning test required for the complete release.

Mobile coverage is Chromium viewport emulation at 390 × 844. It does not establish physical-phone behavior, acoustic quality, Safari compatibility, or accessibility conformance.

The updated companion layout was visually reviewed at 1440 × 1000 and 390 × 844. Voice controls were verified disabled, research tools hidden by default, and image preparation explicitly labelled as local/unsent. The activity timeline records real local actions only; no fabricated conversation was used in tests or screenshots.

Studio validation ran the browser suite with `TEST_PORT=5176 npm run test:browser` to avoid an existing development server with stale dependency assets on port 5173. All 17 tests passed. Settings tests use obvious dummy strings, not real API keys. Key storage success is not provider authentication evidence. The production dependency audit above is retained from the preceding increment; this UI change adds no dependencies.

Screenshots: [Studio reader](screenshots/studio-reader.png), [welcome](screenshots/studio-welcome.png), and [connection settings](screenshots/studio-connection.png).

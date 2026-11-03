# Studio voice integration

Studio connects directly from the browser to OpenAI's GA Realtime API over WebRTC. The default is `gpt-realtime-2.1`, with `gpt-realtime` and `gpt-realtime-mini` selectable in Connection settings for accounts with different access. The voice is Marin; input transcription uses `gpt-4o-mini-transcribe`.

## Use

Run `npm ci` and `npm run dev`, open the localhost address, and load a PDF. In Connection settings, save your OpenAI API key and choose a model your project can access. Click **Start voice**, allow microphone access, and ask a question. Responses play through your speakers and transcripts appear in the conversation. You can also type while connected.

**Stop reply** cancels the current response, clears playing audio, and cancels pending document lookups without disconnecting voice. Late receipt/transcript events cannot restart that reply. The dock shows Listening, Thinking, Speaking, or Microphone muted; microphone and reply controls are separate.

**Mute** stops microphone tracks, while keeping replies and typed input available. **Unmute** requests a new microphone track. **Stop voice** closes the connection and stops capture and playback immediately. Backgrounding the tab, leaving the page, losing connectivity, changing connection settings, or replacing/clearing the document stops the session. Returning to the page does not reconnect automatically. Each session ends after 20 minutes and can be restarted explicitly. Collapsing the companion preserves the session; expand it to access voice controls.

Microphone capture requires HTTPS or localhost. A cloud development server needs a reachable HTTPS preview or localhost forwarding before it can be used from another device. This change does not deploy the app or provide a public preview URL.

## Personal browser-key design

The previously selected personal prototype stores the user's key in unencrypted browser localStorage. On Start voice, the browser sends it **only to `https://api.openai.com/v1/realtime/client_secrets`**, obtains an ephemeral credential, and exchanges an SDP offer at `/v1/realtime/calls`. No key is embedded in source, read by the cloud workspace, or sent to an application backend. Settings changes alone make no API request. The app never displays raw provider errors, which can contain sensitive values.

This is a deliberate bring-your-own-key prototype. OpenAI's recommended hosted application design mints ephemeral credentials on a trusted backend. Do not deploy this design as a shared application with an operator-owned secret. Browser storage remains accessible to scripts on the origin. Account billing, model access, browser CORS behavior, and actual acoustic quality require a live check with the user's account and browser.

## Questions, evidence, and interruption

Server VAD detects speech but automatic response creation is disabled. Speech start snapshots the rendered physical PDF page; response creation includes that snapshot. Scrolling later changes the next question's context, not the question in progress. If a page was still rendering, its context is explicitly unknown. Typed questions take the same snapshot.

The app supplies five read-only tools: current-page text/image, explicit page text/image with PDF or printed-label numbering, indexed keyword search, automatic numbered-figure scanning, and PDF bookmark discovery. Tools never navigate the foreground reader. Printed-label ambiguity is returned as an error rather than silently selecting a page. Search reports index coverage, including unreadable/failed pages and unfinished indexing.

Each question allows eight tool calls and three image requests. Text excerpts are limited to 2,500 characters each, with match-centered search snippets and nextTextOffset for continuation; searches return up to five sources and chapter discovery up to 50 matching bookmarks. Images respect the negotiated WebRTC message limit, with compression/downscaling when necessary. Numbered-figure discovery scans extracted text locally in resumable batches; likely captions require image verification. OCR, semantic search, and concept indexing remain incomplete; the assistant must describe gaps rather than claim exhaustive understanding.

Settled-page preparation remains local. A question does **not** automatically upload a page image; the model requests an image when needed. Actual image bytes are supplied as `input_image` content, separate from textual function outputs. The timeline distinguishes local preparation, pending delivery, confirmed conversation-item receipt, and unconfirmed delivery. Confirmed deliveries are titled **Page image sent** or **Text excerpt sent** (plural when needed). Expand a source to inspect the actual retained image or transmitted text, JPEG dimensions or text character count, and the printed-label/physical-page mapping. A printed book label and PDF page position identify the same source page. Local indexing may extract text across the book, but only requested, bounded excerpts are sent to OpenAI. Receipt does not prove the model understood the image. The provider transcript is generated text, not a measurement of exactly what the user heard before an interruption.

Client conversation-item IDs are generated within the Realtime input schema's 32-character limit. Rejected source events are matched to their receipt using the client event ID; the UI shows a known error code/schema field without echoing raw provider messages. Receipt timeout or rejection leaves voice connected, but does not request an answer from unconfirmed evidence. The next question can retry.

A new question cancels prior retrieval and receipt waits. Late responses cannot continue an obsolete question or append its transcript deltas. WebRTC and server VAD handle audio interruption/truncation. Document replacement invalidates the entire connection. Provider events and tool arguments are treated as untrusted input; only the fixed local document tools can run.

The UI displays accumulated input/output tokens reported by completed Realtime responses. This is **not** a bill or a spending cap: transcription billing and interrupted-session usage may not be fully represented. No durable budget ledger is implemented.

## Verification scope

Automated tests use synthetic PDFs, dummy credentials, a simulated WebRTC peer/microphone, and intercepted OpenAI HTTP requests. They exercise real application orchestration and document rendering but do not validate live provider authentication, CORS, negotiated codecs, network acoustics, speaker echo, or model answers. A real browser microphone session and a held-out image interpretation check remain necessary for live acceptance. No paid model call was made during implementation.

## API references checked 3 November 2026

- [Realtime WebRTC connection](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime): ephemeral credentials, calls endpoint, media tracks, and event channel.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): GA transcripts, image content, function outputs, and response continuation.
- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1): audio, image input, and tool capabilities. Access depends on the account.

- [Realtime client event schema](https://developers.openai.com/api/reference/resources/realtime/client-events): client input IDs and event correlation.

See [experiment workflow and rollback](experiments.md) for the preserved demo, branch separation, scan limits, and deployment policy.

# Provider-aware voice picker

The default remains OpenAI `gpt-realtime-2.1`. The picker groups supported conversational voice models by provider, explains each choice in Connection settings, and labels older previews and deprecated models. It is a curated catalog checked on 3 November 2026, not a claim that every listed model is enabled on the user's account. It excludes text-only, translation-only, and transcription-only models and duplicate dated snapshots.

Selecting a model from a provider without a saved key opens an inline setup prompt. Cancel clears the draft and retains the selection and running session. Save and switch stores the key under that provider's storage key, selects the model, and stops any existing session. It makes no provider call or microphone request. Existing OpenAI keys and the prior model preference remain compatible. Known OpenAI/Google key-prefix mismatches are rejected, but key validity and model access are checked only on connection.

The dock reports the requested model. When a provider returns a recognized model ID in its session event, the dock instead labels it Provider confirmed. Gemini setup completion does not report a resolved model ID, so its label remains Requested model. Unknown provider strings are not echoed. Model changes never silently fall back to another provider or model.

## Connections

- OpenAI Realtime uses the existing browser-to-OpenAI ephemeral credential and WebRTC implementation. Latest additions are `gpt-realtime-2.1-mini`, plus earlier `gpt-realtime-2` and `gpt-realtime-1.5` options. Legacy aliases are retained and labeled with their announced retirement date.
- GPT-Live 1 uses `/v1/live/sessions` and WebRTC with Responses delegation to `gpt-6-luna`. The backend receives document tools and requested page images; the voice frontend receives the backend's findings. Voice duration and backend usage are billed separately. The app processes nested Responses output-item events, sends tool results before continuing, and requests `session.close` when stopping. Capture and playback stop immediately, with up to five seconds allowed for close acknowledgment. The usage display does not invent a token total for this adapter.
- Google Gemini Live uses Google's documented `v1beta` WebSocket endpoint and only the saved Gemini key. Microphone PCM is captured in an AudioWorklet at 16 kHz; returned PCM is played with its declared sample rate. Tool calls reuse the local document tools; JPEGs are sent as visual input and excerpts as tool responses. Closing, backgrounding, changing settings, or replacing a document releases microphone/audio resources and discards pending results.

These additional adapters are experimental. Tests simulate provider connections; actual account access, direct-browser CORS for GPT-Live startup, acoustics, latency and model-selected tool behavior require live acceptance. The personal BYOK design sends credentials only to their provider endpoints, not the Sites host. For a shared product, move session creation to an authenticated backend with secure credential handling, following provider recommendations. No key is embedded in the build. Gemini's documented direct WebSocket-key authentication puts the key in the provider connection URL; the app does not log that URL or raw provider errors.

Realtime has individual conversation-item receipt acknowledgments. GPT-Live result submissions and Gemini tool responses do not have the same acknowledgment contract, so their history says Sent with receipt unconfirmed; it never claims confirmed receipt. The experimental Stop reply control silences local playback and requests interruption; it does not promise cancellation of already-running provider work. GPT-Live speaking state is estimated from transcript activity because its WebRTC protocol has no per-utterance playback-completion event.

## Official references

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- https://developers.openai.com/api/docs/models/gpt-live-1
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/live-delegation
- https://developers.openai.com/api/docs/deprecations
- https://aistudio.google.com/docs/models
- https://ai.google.dev/api/live?hl=en
- https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

No official `gpt-live-1.1` or `gemini-live-1.1` catalog entry was verified; invented model IDs are not offered.

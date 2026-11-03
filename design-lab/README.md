# Margin design lab

Three interactive design directions, isolated from the working application. The application source, document service, and existing tests are unchanged.

- **Air** — white, restrained, conversation-first; closest to the simplicity of a desktop voice chat.
- **Focus** — dark reading environment, vertical navigation, luminous voice bubble.
- **Studio** — pale green workspace, editorial typography, floating horizontal voice dock.

## Try the designs

Open `previews/design-gallery.html` in a browser. This is a self-contained offline HTML export: switch designs using the bar at the top. No server, installation, or API key is needed. The hashes `#air`, `#focus`, and `#studio` select a specific design.

Clickable interactions include page/zoom controls, source previews, mock background lookup, typed sample messages, simulated start/mute/stop, and a one-click connection settings panel.

For development, first install the root project's locked dependencies with `npm ci`, then run:

```sh
npm --prefix design-lab run dev
npm --prefix design-lab run build
```

The lab reuses the repository's pinned React/Vite/tooling dependencies. It does not have a separate dependency installation or lockfile. The build type-checks the lab, creates `design-lab/dist`, and exports the offline gallery. The existing app runs independently.

## API key experience

The landing workspace has no key prompt. Clicking Start talking for the first time opens a one-time setup dialog. Connection settings are always one click away. Saving the demo connection remembers only a boolean setup flag, so a refresh does not repeat onboarding. You can update or forget that demo connection from settings.

**Use a dummy value only.** The mock discards the input when saving/closing. It does not retain an API key, connect to a provider, request microphone access, read a real PDF, or make paid requests. All conversations, document content, and retrieval results are sample data and visibly labelled as such.

## Product direction captured for the selected design

The user now wants a personal browser-local prototype with their own OpenAI API key, rather than a private authenticated hosted service at this stage. The chosen design will be applied only after review.

- Documents, reading state, and optional conversation history should live on the user's device, with clear deletion controls. Use IndexedDB for documents; the browser's HTTP cache is not suitable application storage. Browser storage can be cleared or evicted, so persistence must not be presented as guaranteed.
- Key setup belongs in first-use voice onboarding and in one-click settings, not on the reading workspace. The actual implementation must distinguish persistent key storage from session-only use. A key stored in browser storage is accessible to scripts running on that origin and is not protected like a server-side secret.
- Account/login gates and the original multi-user server architecture are deferred for this personal prototype. Client-side cost limits are best effort and cannot provide the prior server-enforced admission guarantee. Revisit the cost model and transport before live integration.
- Verify the current official OpenAI Realtime model, supported browser transport, account access, and pricing before making a real connection. The mocks deliberately do not guess a model name such as “GPT Live 1.”
- No live voice integration, credential migration, ledger change, deployment, or paid call is included in this design task.

## Review

Screenshots are in `previews/air.png`, `previews/focus.png`, and `previews/studio.png`. Choose a direction or mix its navigation, typography, voice dock, and conversation treatment with another. None has been applied to the working app.

## Validation

- TypeScript and production build passed.
- `node design-lab/check.mjs` passed all three design flows using the exported HTML, served locally without external resources.
- Verified first-use setup, refresh persistence of the demo flag, updating/forgetting setup, no key values in localStorage, sample voice controls, background lookup, typed messages, and mobile width/one-click settings.
- No external network requests or browser errors occurred in those flows.
- Direct file-URL browser testing was blocked by the cloud browser's administrator policy. The same self-contained export was validated over a temporary local HTTP server; file-scheme execution in this managed browser is not claimed.
- Desktop screenshots were visually reviewed. All modified/new files for this task are inside `design-lab/`; the actual app is unchanged.

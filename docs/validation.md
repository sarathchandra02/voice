# Validation — Studio reader increment

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

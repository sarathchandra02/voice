# Architecture of the first increment

The human reader and the research panel share one `PdfDocument` service. The service owns the local PDF worker, document identity, page labels, outline entries, text cache, search index, and bounded source registry. The human reader owns page/zoom/scroll state. Research owns a separate request controller, evidence list, and sequential-page cursor.

Reading or rendering a source never mutates foreground state. Only the explicit source-open action invokes viewer navigation. Viewer render completion is acknowledged separately from the requested page. Source images are rendered into dedicated off-screen canvases and contain no surrounding app UI.

Document replacement aborts loading, disposes the old PDF worker, cancels render tasks, clears sources/cache/index, and mounts new reader and research components under a fresh document identity. Async retrieval checks identity lifetime and cancellation after awaits. Foreground page changes cancel pending dwell-image preparation. Research requests cancel their predecessors.

The current service is a local retrieval seam, not a provider-facing protocol. Future tools must add session/turn/request bindings, strict server validation, admission, and actual evidence delivery. Current-page metadata and local image preparation do not imply that a model received an image. The UI states that nothing has been sent.

The PDF adapter uses only parsing, text extraction, outline, and rendering APIs. It does not mount PDF scripting, forms, embedded links, or an annotation interaction layer. React renders filenames, labels, outlines, and extracted text as text. The application has no upload endpoint, analytics, provider credentials, or external content-fetch tool.

PDF.js and its support assets are pinned and served locally. Operational resource limits are centralized in `src/documents/model.ts`; the remaining full-release memory and worker-scheduling requirements are recorded in the README rather than claimed as complete.

The companion now separates presentation into a scrollable session activity log, an idle voice dock, and a native modal dialog for manual research tools. Retrieval emits explicit request/result/error events; settled-page preparation emits local-context events. No event is labelled as sent to a provider. The timeline holds at most thirty entries and six image blobs and revokes object URLs on cleanup. It preserves a reader's history scroll position when new activity arrives. Document replacement remounts the companion and clears its history; collapsing the companion preserves it.

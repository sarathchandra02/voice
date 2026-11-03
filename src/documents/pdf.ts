import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  LIMITS,
  LocalIndex,
  type Chapter,
  type Coverage,
  type Source,
} from "./model";
GlobalWorkerOptions.workerSrc = workerUrl;

// One document identity is shared by independent foreground and research clients.
export class PdfDocument {
  readonly id = crypto.randomUUID();
  readonly index = new LocalIndex();
  readonly sources = new Map<string, Source>();
  labels: string[] = [];
  hasBookLabels = false;
  chapters: Chapter[] = [];
  disposed = false;
  coverage: Coverage;
  private cache = new Map<number, { text: string; clipped: boolean }>();
  private indexRunning = false;
  private listeners = new Set<() => void>();
  private renders = new Set<RenderTask>();
  private constructor(
    readonly pdf: PDFDocumentProxy,
    readonly name: string,
  ) {
    this.coverage = {
      processed: 0,
      readable: 0,
      unreadable: 0,
      failed: 0,
      clipped: 0,
      limited: false,
      paused: false,
      total: pdf.numPages,
    };
  }
  static async open(file: File, signal: AbortSignal) {
    if (file.size > LIMITS.fileBytes)
      throw new Error(
        `This version supports PDFs up to ${LIMITS.fileBytes / 1_000_000} MB.`,
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw new Error(
        "Choose a valid PDF file. Excel support is coming in the next increment.",
      );
    const task = getDocument({
      data: bytes,
      enableXfa: false,
      useSystemFonts: true,
      stopAtErrors: true,
      cMapUrl: "/pdf-assets/cmaps/",
      standardFontDataUrl: "/pdf-assets/standard_fonts/",
      wasmUrl: "/pdf-assets/wasm/",
    });
    const abort = () => {
      void task.destroy();
    };
    signal.addEventListener("abort", abort, { once: true });
    let doc: PdfDocument | undefined;
    try {
      const pdf = await task.promise;
      signal.throwIfAborted();
      if (pdf.numPages > LIMITS.pages)
        throw new Error(
          `This version supports at most ${LIMITS.pages.toLocaleString("en-US")} PDF pages.`,
        );
      doc = new PdfDocument(pdf, file.name);
      const labels = await pdf.getPageLabels();
      doc.hasBookLabels = !!labels;
      doc.labels = labels || Array.from({ length: pdf.numPages }, () => "");
      // Outline entries are hints, not proof of a complete chapter catalog.
      const outline = await pdf.getOutline();
      const walk = async (
        items: NonNullable<typeof outline>,
        depth: number,
      ) => {
        for (const item of items) {
          if (doc!.chapters.length >= 200 || depth > 10) return;
          signal.throwIfAborted();
          try {
            const dest =
              typeof item.dest === "string"
                ? await pdf.getDestination(item.dest)
                : item.dest;
            if (dest) {
              const page =
                typeof dest[0] === "number"
                  ? dest[0] + 1
                  : (await pdf.getPageIndex(dest[0])) + 1;
              if (page >= 1 && page <= pdf.numPages)
                doc!.chapters.push({
                  title: item.title.slice(0, 200),
                  page,
                  depth,
                });
            }
          } catch {
            /* Invalid outline entries never block direct page reading. */
          }
          if (item.items) await walk(item.items, depth + 1);
        }
      };
      if (outline) await walk(outline, 0);
      signal.throwIfAborted();
      return doc;
    } catch (error) {
      if (doc) doc.dispose();
      else await task.destroy();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    this.listeners.forEach((fn) => fn());
  }
  private check(page: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("This document has been cleared.");
    if (!Number.isInteger(page) || page < 1 || page > this.pdf.numPages)
      throw new Error("Invalid physical PDF page.");
  }
  setLabel(page: number, label: string) {
    this.check(page);
    if (!label.trim() || label.length > 40)
      throw new Error("Use a book label between 1 and 40 characters.");
    this.labels[page - 1] = label.trim();
    this.hasBookLabels = true;
    // Physical source locations remain stable; invalidate displayed label-bearing evidence.
    this.sources.clear();
    this.notify();
  }
  async text(page: number, signal?: AbortSignal) {
    this.check(page, signal);
    const cached = this.cache.get(page);
    if (cached) {
      this.cache.delete(page);
      this.cache.set(page, cached);
      return cached;
    }
    const pdfPage = await this.pdf.getPage(page);
    this.check(page, signal);
    const content = await pdfPage.getTextContent();
    this.check(page, signal);
    let text = "";
    let clipped = content.items.length > LIMITS.textItems;
    for (const item of content.items.slice(0, LIMITS.textItems)) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      if (text.length > LIMITS.textChars) {
        text = text.slice(0, LIMITS.textChars);
        clipped = true;
        break;
      }
    }
    const result = { text: text.trim(), clipped };
    this.cache.set(page, result);
    while (
      this.cache.size > LIMITS.cachePages ||
      [...this.cache.values()].reduce((n, x) => n + x.text.length, 0) >
        LIMITS.cacheChars
    )
      this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  async read(page: number, signal?: AbortSignal): Promise<Source> {
    const result = await this.text(page, signal);
    this.check(page, signal);
    const source: Source = {
      id: crypto.randomUUID(),
      documentId: this.id,
      page,
      label: this.labels[page - 1],
      kind: "text",
      text: result.text.slice(0, 8000),
      clipped: result.clipped || result.text.length > 8000,
    };
    this.register(source);
    return source;
  }
  private register(source: Source) {
    this.sources.set(source.id, source);
    while (this.sources.size > 12)
      this.sources.delete(this.sources.keys().next().value!);
  }
  async render(
    page: number,
    canvas: HTMLCanvasElement,
    scale: number,
    signal: AbortSignal,
    maxPixels = 4000000,
    maxEdge = 4096,
  ) {
    this.check(page, signal);
    const pdfPage = await this.pdf.getPage(page);
    this.check(page, signal);
    const natural = pdfPage.getViewport({ scale });
    const factor = Math.min(
      1,
      Math.sqrt(maxPixels / (natural.width * natural.height)),
      maxEdge / Math.max(natural.width, natural.height),
    );
    const viewport = pdfPage.getViewport({ scale: scale * factor });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const render = pdfPage.render({ canvas, viewport });
    this.renders.add(render);
    const cancel = () => render.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await render.promise;
      this.check(page, signal);
    } finally {
      signal.removeEventListener("abort", cancel);
      this.renders.delete(render);
    }
    return viewport;
  }
  async image(page: number, signal: AbortSignal): Promise<Source> {
    const canvas = document.createElement("canvas");
    try {
      await this.render(page, canvas, 2, signal, 2000000, 1536);
      let blob: Blob | null = null;
      for (const quality of [0.88, 0.72, 0.5]) {
        this.check(page, signal);
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size <= LIMITS.imageBytes) break;
      }
      this.check(page, signal);
      if (!blob || blob.size > LIMITS.imageBytes)
        throw new Error(
          "This page image exceeds the local image limit. Use its text or a simpler source.",
        );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer(),
      );
      this.check(page, signal);
      const source: Source = {
        id: crypto.randomUUID(),
        documentId: this.id,
        page,
        label: this.labels[page - 1],
        kind: "image",
        image: blob,
        width: canvas.width,
        height: canvas.height,
        hash: Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
        clipped: false,
      };
      this.register(source);
      return source;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  async startIndex() {
    this.coverage.paused = false;
    this.notify();
    if (this.indexRunning || this.disposed) return;
    this.indexRunning = true;
    try {
      while (
        !this.disposed &&
        !this.coverage.paused &&
        this.coverage.processed < this.pdf.numPages
      ) {
        const page = this.coverage.processed + 1;
        try {
          const result = await this.text(page);
          if (this.disposed) return;
          this.index.add(page, result.text);
          if (result.text) this.coverage.readable++;
          else this.coverage.unreadable++;
          if (result.clipped) this.coverage.clipped++;
        } catch {
          if (this.disposed) return;
          this.coverage.failed++;
        }
        this.coverage.processed++;
        this.coverage.limited = this.index.limited;
        this.notify();
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
    } finally {
      this.indexRunning = false;
    }
  }
  pauseIndex() {
    this.coverage.paused = true;
    this.notify();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renders.forEach((task) => task.cancel());
    this.cache.clear();
    this.sources.clear();
    this.index.clear();
    this.listeners.clear();
    void this.pdf.loadingTask.destroy();
  }
}

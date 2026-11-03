import { ReaderDocument } from "./base";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LIMITS } from "./model";
GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfDocument extends ReaderDocument {
  readonly kind = "pdf" as const;
  readonly unit = "PDF page";
  get pageCount() {
    return this.pdf.numPages;
  }
  private cache = new Map<number, { text: string; clipped: boolean }>();
  private renders = new Set<RenderTask>();
  private constructor(
    readonly pdf: PDFDocumentProxy,
    name: string,
  ) {
    super(name, pdf.numPages);
  }
  async size(page: number) {
    this.check(page);
    return (await this.pdf.getPage(page)).getViewport({ scale: 1 });
  }
  static async open(file: File, signal: AbortSignal) {
    if (file.size > LIMITS.fileBytes)
      throw new Error(
        `This version supports PDFs up to ${LIMITS.fileBytes / 1_000_000} MB.`,
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw new Error("Choose a valid PDF file.");
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
  override dispose() {
    if (this.disposed) return;
    super.dispose();
    this.renders.forEach((task) => task.cancel());
    this.cache.clear();
    void this.pdf.loadingTask.destroy();
  }
}

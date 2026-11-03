import DOMPurify from "dompurify";
import { ReaderDocument } from "./base";
import {
  layoutWord,
  loadLocalImage,
  WORD_SIZE,
  type WordPage,
} from "./word-layout";
import type { Chapter } from "./model";
type Kind = "ppt" | "pptx" | "docx";
type Slide = { svg: string; text: string; clipped: boolean; hidden: boolean };
type Parsed = {
  ok: boolean;
  error?: string;
  progress?: string;
  width: number;
  height: number;
  slides: Slide[];
  html: string;
  warnings: number;
};
function parseOffice(
  bytes: ArrayBuffer,
  kind: Kind,
  signal: AbortSignal,
  progress?: (message: string) => void,
): Promise<Parsed> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./office.worker.ts", import.meta.url), {
      type: "module",
    });
    const done = () => {
      worker.terminate();
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      done();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      done();
      reject(
        new Error(
          "Import took too long. Split this document into smaller files or export it as PDF.",
        ),
      );
    }, 90000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      done();
      reject(
        new Error(
          "The Office importer could not start. Refresh the app and try again.",
        ),
      );
    };
    worker.onmessage = (event: MessageEvent<Parsed>) => {
      if (event.data.progress) {
        progress?.(event.data.progress);
        return;
      }
      done();
      if (!event.data.ok) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage({ bytes, kind }, [bytes]);
  });
}
// Only inert SVG in an image decoder: no HTML, scripts, links or remote resources.
function safeSvg(svg: string) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["style", "foreignObject", "a", "script", "animate", "set"],
    ADD_DATA_URI_TAGS: ["image"],
  });
  const xml = new DOMParser().parseFromString(clean, "image/svg+xml");
  if (xml.querySelector("parsererror"))
    throw new Error("This slide preview could not be rendered.");
  for (const node of xml.querySelectorAll("*")) {
    for (const attr of Array.from(node.attributes)) {
      if (
        attr.localName === "href" &&
        !attr.value.startsWith("#") &&
        !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(attr.value)
      )
        node.removeAttributeNode(attr);
      else if (
        /url\(/i.test(attr.value) &&
        !/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/.test(attr.value)
      )
        node.removeAttributeNode(attr);
    }
  }
  return new XMLSerializer().serializeToString(xml.documentElement);
}
export class OfficeDocument extends ReaderDocument {
  readonly unit: string;
  readonly pageCount: number;
  override readonly previewNote: string;
  private constructor(
    name: string,
    readonly kind: Kind,
    private dimensions: { width: number; height: number },
    private slides: Slide[],
    private wordPages: WordPage[],
    chapters: Chapter[],
    warnings: number,
  ) {
    super(name, kind === "docx" ? wordPages.length : slides.length);
    this.pageCount = this.coverage.total;
    this.unit = kind === "docx" ? "Reading page" : "Slide";
    this.labels = Array(this.pageCount).fill("");
    this.chapters = chapters;
    this.previewNote =
      kind === "docx"
        ? "Reflowed Word preview. Reading page numbers belong to this app, not Word. Layout, headers, footers and some formatting may differ. Export to PDF for exact print layout."
        : "Static PowerPoint preview. Fonts and complex graphics may differ. Animations, media playback and speaker notes are not included. Export to PDF for exact layout.";
    if (warnings)
      this.previewNote +=
        " Some content could not be represented; check the original file.";
  }
  static async open(
    file: File,
    kind: Kind,
    signal: AbortSignal,
    progress?: (message: string) => void,
  ) {
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    const parsed = await parseOffice(bytes, kind, signal, progress);
    signal.throwIfAborted();
    if (kind === "docx") {
      progress?.("Laying out Word reading pages…");
      const result = await layoutWord(parsed.html, signal);
      return new OfficeDocument(
        file.name,
        kind,
        WORD_SIZE,
        [],
        result.pages,
        result.chapters,
        parsed.warnings + result.missingImages,
      );
    }
    const chapters = parsed.slides.map((slide, i) => ({
      title: `${slide.hidden ? "[Hidden] " : ""}${
        slide.text
          .split("\n")
          .find((t) => t.trim())
          ?.slice(0, 160) || `Slide ${i + 1}`
      }`,
      page: i + 1,
      depth: 0,
    }));
    return new OfficeDocument(
      file.name,
      kind,
      { width: parsed.width, height: parsed.height },
      parsed.slides,
      [],
      chapters,
      0,
    );
  }
  async size(page: number) {
    this.check(page);
    return this.dimensions;
  }
  async text(page: number, signal?: AbortSignal) {
    this.check(page, signal);
    const item =
      this.kind === "docx" ? this.wordPages[page - 1] : this.slides[page - 1];
    return {
      text: item.text,
      clipped: "clipped" in item ? item.clipped : false,
    };
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
    const { width, height } = this.dimensions;
    const ratio = Math.min(
      scale,
      Math.sqrt(maxPixels / (width * height)),
      maxEdge / Math.max(width, height),
    );
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    if (this.kind !== "docx") {
      const blob = new Blob([safeSvg(this.slides[page - 1].svg)], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadLocalImage(url, signal);
        this.check(page, signal);
        ctx.drawImage(img, 0, 0, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      ctx.textBaseline = "top";
      for (const item of this.wordPages[page - 1].items) {
        this.check(page, signal);
        if (item.kind === "text") {
          ctx.font = `${item.italic ? "italic " : ""}${item.bold ? "bold " : ""}${item.size}px Arial, sans-serif`;
          ctx.fillStyle = "#26352c";
          ctx.fillText(item.text, item.x, item.y);
        } else if (item.kind === "cell") {
          ctx.strokeStyle = "#bdc8bf";
          ctx.lineWidth = 1;
          ctx.strokeRect(item.x, item.y, item.width, item.height);
        } else {
          const img = await loadLocalImage(item.src, signal);
          this.check(page, signal);
          ctx.drawImage(img, item.x, item.y, item.width, item.height);
        }
      }
      ctx.font = "12px Arial, sans-serif";
      ctx.fillStyle = "#6c776e";
      ctx.fillText(`Reading page ${page} · Margin`, 58, 1065);
    }
    this.check(page, signal);
    return { width: canvas.width, height: canvas.height };
  }
  override dispose() {
    if (this.disposed) return;
    super.dispose();
    this.slides = [];
    this.wordPages = [];
  }
}

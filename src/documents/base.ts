import { searchExcerptOffset } from "./references";
import {
  LIMITS,
  LocalIndex,
  type Chapter,
  type Coverage,
  type Source,
} from "./model";

export abstract class ReaderDocument {
  readonly id = crypto.randomUUID();
  readonly index = new LocalIndex();
  readonly sources = new Map<string, Source>();
  labels: string[] = [];
  hasBookLabels = false;
  chapters: Chapter[] = [];
  disposed = false;
  abstract readonly kind: "pdf" | "ppt" | "pptx" | "docx";
  abstract readonly pageCount: number;
  abstract readonly unit: string;
  readonly previewNote: string = "";
  coverage: Coverage;
  private indexRunning = false;
  private listeners = new Set<() => void>();
  constructor(
    readonly name: string,
    total: number,
  ) {
    this.coverage = {
      processed: 0,
      readable: 0,
      unreadable: 0,
      failed: 0,
      clipped: 0,
      limited: false,
      paused: false,
      total,
    };
  }
  get shortUnit() {
    return this.kind === "pdf" ? "PDF" : this.unit;
  }
  abstract text(
    page: number,
    signal?: AbortSignal,
  ): Promise<{ text: string; clipped: boolean }>;
  abstract size(page: number): Promise<{ width: number; height: number }>;
  abstract render(
    page: number,
    canvas: HTMLCanvasElement,
    scale: number,
    signal: AbortSignal,
    maxPixels?: number,
    maxEdge?: number,
  ): Promise<{ width: number; height: number }>;
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected notify() {
    this.listeners.forEach((fn) => fn());
  }
  protected check(page: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("This document has been cleared.");
    if (!Number.isInteger(page) || page < 1 || page > this.pageCount)
      throw new Error("Invalid document location.");
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
  async read(
    page: number,
    signal?: AbortSignal,
    options: { offset?: number; maxChars?: number; query?: string } = {},
  ): Promise<Source> {
    const result = await this.text(page, signal);
    this.check(page, signal);
    const offset = options.query
      ? searchExcerptOffset(result.text, options.query)
      : (options.offset ?? 0);
    if (offset > result.text.length)
      throw new Error("Text offset is beyond this page's extracted text.");
    const limit = options.maxChars ?? 8000;
    const end = Math.min(result.text.length, offset + limit);
    const source: Source = {
      id: crypto.randomUUID(),
      documentId: this.id,
      page,
      label: this.labels[page - 1],
      location: `${this.unit} ${page}`,
      previewNote: this.previewNote || undefined,
      kind: "text",
      text: result.text.slice(offset, end),
      textStart: offset,
      totalTextChars: result.text.length,
      nextTextOffset: end < result.text.length ? end : undefined,
      clipped: result.clipped || offset > 0 || end < result.text.length,
    };
    this.register(source);
    return source;
  }
  private register(source: Source) {
    this.sources.set(source.id, source);
    while (this.sources.size > 12)
      this.sources.delete(this.sources.keys().next().value!);
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
        location: `${this.unit} ${page}`,
        previewNote: this.previewNote || undefined,
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
        this.coverage.processed < this.pageCount
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
    this.sources.clear();
    this.index.clear();
    this.listeners.clear();
  }
}

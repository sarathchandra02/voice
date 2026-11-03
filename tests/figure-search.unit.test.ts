import { describe, expect, it, vi } from "vitest";
import { LocalIndex } from "../src/documents/model";
import {
  figureMatch,
  figureNumber,
  searchExcerptOffset,
} from "../src/documents/references";
import { findFigure } from "../src/documents/figures";
import { DocumentTools } from "../src/voice/tools";
import type { PdfDocument } from "../src/documents/pdf";

function fixture(pages: string[]) {
  const doc = {
    id: "figures",
    disposed: false,
    labels: pages.map((_, i) => String(i + 1)),
    text: vi.fn(async (page: number) => ({
      text: pages[page - 1],
      clipped: false,
    })),
    read: vi.fn(
      async (
        page: number,
        _signal: AbortSignal,
        options: { offset: number; maxChars: number },
      ) => ({
        id: `source-${page}`,
        documentId: "figures",
        page,
        label: String(page),
        kind: "text",
        text: pages[page - 1].slice(
          options.offset,
          options.offset + options.maxChars,
        ),
        clipped: true,
      }),
    ),
  };
  return { raw: doc, doc: doc as unknown as PdfDocument };
}
const signal = () => new AbortController().signal;

describe("exact document references", () => {
  it("preserves chapter digits and decimal figure identifiers without confusing 9.2 with 9.20", () => {
    const index = new LocalIndex();
    index.add(1, "Chapter 8. Figure 9.20");
    index.add(40, "Chapter 9. Fig. 9.2");
    index.add(41, "Figure 9 . 2 another caption");
    expect(index.search("Chapter 9")).toEqual([40]);
    expect(index.search("Figure 9.2")).toEqual([40, 41]);
    expect(index.search("9.20")).toEqual([1]);
  });
  it("paginates within a physical page range", () => {
    const index = new LocalIndex();
    for (let p = 20; p >= 1; p--) index.add(p, "Figure 9.2");
    expect(index.search("9.2", 0, 10, 17)).toEqual([10, 11, 12, 13, 14]);
    expect(index.search("9.2", 5, 10, 17)).toEqual([15, 16, 17]);
  });
  it("handles abbreviations and line breaks while rejecting partial identifiers", () => {
    expect(figureNumber(" Fig. 9 . 2 ")).toBe("9.2");
    expect(figureMatch("Fig.\n9 . 2: A comparison", "9.2")?.kind).toBe(
      "caption_candidate",
    );
    for (const text of [
      "Figure 9.20",
      "Figure 9.2a",
      "Figure 9.2.1",
      "Figure 19.2",
    ])
      expect(figureMatch(text, "9.2")).toBeUndefined();
    expect(() => figureNumber("9.2|.*")).toThrow();
  });
  it("prefers a caption line over a passing mention and centers excerpts on the identifier", () => {
    const text =
      "See Figure 9.2 for details.\n" +
      "Earlier text. ".repeat(400) +
      "\nFigure 9.2: Actual chart";
    const match = figureMatch(text, "9.2")!;
    expect(match.kind).toBe("caption_candidate");
    expect(match.offset).toBeGreaterThan(2500);
    const offset = searchExcerptOffset(
      "Unrelated figure. " + "x".repeat(6000) + "\nFigure 9.2: Chart",
      "Figure 9.2",
    );
    expect(offset).toBeGreaterThan(2500);
  });
});

describe("automatic resumable figure scan", () => {
  it("finds a late caption outside excerpt limits and ranks it above early mentions", async () => {
    const pages = Array.from({ length: 20 }, () => "Unrelated text");
    pages[0] = "Refer to Figure 9.2 for results.";
    pages[1] = "Figure 9.20: Different chart";
    pages[18] = "Body text ".repeat(600) + "\nFigure 9.2: Regression chart";
    const { doc, raw } = fixture(pages);
    const progress = vi.fn();
    const result = await findFigure(doc, "9.2", 1, 20, signal(), progress);
    expect(result.data.candidates.map((c) => c.page)).toEqual([19, 1]);
    expect(result.sources[0].text).toContain("Figure 9.2: Regression chart");
    expect(result.sources[0].text!.length).toBeLessThanOrEqual(2500);
    expect(result.data.scan).toMatchObject({ complete: true, checked: 20 });
    expect(raw.text).toHaveBeenCalledTimes(20);
    expect(progress).toHaveBeenCalled();
    await findFigure(doc, "9.2", 1, 20, signal());
    expect(raw.text).toHaveBeenCalledTimes(20);
  });
  it("resumes beyond the batch limit without repeating checked pages", async () => {
    const { doc, raw } = fixture(Array.from({ length: 270 }, () => "text"));
    const first = await findFigure(doc, "9.2", 1, 270, signal());
    expect(first.data.scan).toMatchObject({
      complete: false,
      checked: 250,
      next_pdf_page: 251,
    });
    const second = await findFigure(doc, "9.2", 1, 270, signal());
    expect(second.data.scan).toMatchObject({ complete: true, checked: 270 });
    expect(raw.text).toHaveBeenCalledTimes(270);
  });
  it("reports failed, blank and clipped pages as gaps", async () => {
    const { doc, raw } = fixture(["", "failed", "Figure 9.2"]);
    raw.text.mockImplementation(async (page) => {
      if (page === 2) throw new Error("Bad extraction");
      return { text: page === 1 ? "" : "Figure 9.2", clipped: page === 3 };
    });
    const result = await findFigure(doc, "9.2", 1, 3, signal());
    expect(result.data.scan).toMatchObject({
      unreadable: 1,
      failed: 1,
      clipped: 1,
      checked: 3,
    });
    expect(result.data.note).toContain("not proof of absence");
  });
  it("cancels promptly, resumes unchecked pages, and isolates document progress", async () => {
    const abort = new AbortController();
    const { doc, raw } = fixture(["text", "Figure 9.2"]);
    raw.text.mockImplementationOnce(async () => {
      abort.abort();
      return { text: "text", clipped: false };
    });
    await expect(findFigure(doc, "9.2", 1, 2, abort.signal)).rejects.toThrow();
    const result = await findFigure(doc, "9.2", 1, 2, signal());
    expect(result.data.scan.checked).toBe(2);
    expect(raw.text.mock.calls.map((c) => c[0])).toEqual([1, 1, 2]);
    const other = fixture(["Different book"]);
    expect(
      (await findFigure(other.doc, "9.2", 1, 1, signal())).sources,
    ).toEqual([]);
    raw.disposed = true;
    await expect(findFigure(doc, "9.2", 1, 2, signal())).rejects.toThrow(
      "replaced",
    );
  });
  it("validates scan ranges and accepts one multi-page scan as one voice tool call", async () => {
    const { doc } = fixture(
      Array.from({ length: 40 }, (_, i) =>
        i === 35 ? "Figure 9.2: Chart" : "text",
      ),
    );
    const tools = new DocumentTools(doc, 1);
    const result = await tools.run("find_figure", '{"number":"9.2"}', signal());
    expect(result.sources[0].page).toBe(36);
    expect(result.data.scan).toMatchObject({ checked: 40, complete: true });
    await expect(
      tools.run(
        "find_figure",
        '{"number":"9.2","start_page":35,"end_page":20}',
        signal(),
      ),
    ).rejects.toThrow("Invalid end_page");
    await expect(
      tools.run("find_figure", '{"number":"9.2","start_page":1.5}', signal()),
    ).rejects.toThrow("Invalid start_page");
  });
});

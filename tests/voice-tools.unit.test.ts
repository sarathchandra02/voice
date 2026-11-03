import { describe, expect, it, vi } from "vitest";
import { DocumentTools } from "../src/voice/tools";
import type { PdfDocument } from "../src/documents/pdf";
function documentFixture() {
  return {
    id: "document",
    disposed: false,
    labels: ["i", "1", "1", "3"],
    chapters: [{ title: "Introduction", page: 2, depth: 0 }],
    coverage: { processed: 2, total: 4, paused: true },
    index: { search: () => [2] },
    read: vi.fn(async (page: number) => ({
      id: `text-${page}`,
      documentId: "document",
      page,
      kind: "text",
      text: "Evidence",
      clipped: false,
    })),
    image: vi.fn(async (page: number) => ({
      id: `image-${page}`,
      documentId: "document",
      page,
      kind: "image",
      image: new Blob(["test"]),
      clipped: false,
    })),
  };
}
const signal = () => new AbortController().signal;
describe("bounded voice document tools", () => {
  it("uses the question's page snapshot and refuses unknown or ambiguous pages", async () => {
    const doc = documentFixture();
    const tools = new DocumentTools(doc as unknown as PdfDocument, 4);
    const result = await tools.run(
      "current_page",
      '{"format":"image"}',
      signal(),
    );
    expect(result.sources[0].page).toBe(4);
    expect((result.data.sources as any[])[0].image).toBeUndefined();
    await expect(
      tools.run(
        "read_page",
        '{"page":"1","numbering":"book","format":"text"}',
        signal(),
      ),
    ).rejects.toThrow("Ambiguous");
    expect(doc.read).not.toHaveBeenCalled();
    await expect(
      new DocumentTools(doc as unknown as PdfDocument, null).run(
        "current_page",
        '{"format":"text"}',
        signal(),
      ),
    ).rejects.toThrow("still rendering");
  });
  it("reports incomplete search coverage and returns exact source locations", async () => {
    const doc = documentFixture();
    const tools = new DocumentTools(doc as unknown as PdfDocument, 1);
    const result = await tools.run(
      "search_book",
      '{"query":"evidence"}',
      signal(),
    );
    expect(result.data.coverage).toEqual(doc.coverage);
    expect(result.sources[0].page).toBe(2);
    expect(doc.image).not.toHaveBeenCalled();
  });
  it("bounds images and total calls per question", async () => {
    const doc = documentFixture();
    const tools = new DocumentTools(doc as unknown as PdfDocument, 1);
    for (let i = 0; i < 3; i++)
      await tools.run("current_page", '{"format":"image"}', signal());
    await expect(
      tools.run("current_page", '{"format":"image"}', signal()),
    ).rejects.toThrow("Three images");
    expect(doc.image).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 4; i++)
      await tools.run("list_chapters", '{"query":""}', signal());
    await expect(
      tools.run("list_chapters", '{"query":""}', signal()),
    ).rejects.toThrow("eight-lookup");
  });
  it("rejects arbitrary tools, extra arguments, cancellation, and replaced documents", async () => {
    const doc = documentFixture();
    const tools = new DocumentTools(doc as unknown as PdfDocument, 1);
    await expect(
      tools.run("fetch", '{"url":"https://example.com"}', signal()),
    ).rejects.toThrow("Unknown");
    await expect(
      tools.run("current_page", '{"format":"text","page":7}', signal()),
    ).rejects.toThrow("Unknown");
    const abort = new AbortController();
    abort.abort();
    await expect(
      tools.run("current_page", '{"format":"text"}', abort.signal),
    ).rejects.toThrow();
    doc.disposed = true;
    await expect(
      tools.run("current_page", '{"format":"text"}', signal()),
    ).rejects.toThrow("replaced");
    expect(doc.read).not.toHaveBeenCalled();
  });
  it("discards a retrieval that completes after cancellation", async () => {
    const doc = documentFixture();
    const abort = new AbortController();
    doc.read.mockImplementation(async (page) => {
      abort.abort();
      return {
        id: "stale",
        documentId: "document",
        page,
        kind: "text",
        text: "stale",
        clipped: false,
      };
    });
    await expect(
      new DocumentTools(doc as unknown as PdfDocument, 1).run(
        "current_page",
        '{"format":"text"}',
        abort.signal,
      ),
    ).rejects.toThrow();
  });
});

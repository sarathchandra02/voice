import { describe, expect, it } from "vitest";
import { LocalIndex, resolvePage } from "../src/documents/model";
describe("shared page resolver", () => {
  const labels = ["i", "ii", "1", "2", "1"];
  it("distinguishes printed and physical numbering", () => {
    expect(resolvePage("2", "book", labels)).toBe(4);
    expect(resolvePage("2", "pdf", labels)).toBe(2);
    expect(resolvePage("II", "book", labels)).toBe(2);
  });
  it("rejects ambiguous labels rather than silently navigating", () => {
    expect(() => resolvePage("1", "book", labels)).toThrow("PDF pages: 3, 5");
  });
  it.each(["0", "-1", "3.5", "NaN", "6", "1e0", ""])(
    "rejects invalid physical page %s",
    (value) => {
      expect(() => resolvePage(value, "pdf", labels)).toThrow();
    },
  );
  it("rejects unknown labels", () =>
    expect(() => resolvePage("93", "book", labels)).toThrow("not mapped"));
});
describe("whole-document local index", () => {
  it("finds an off-screen page and requires all query terms", () => {
    const index = new LocalIndex();
    index.add(95, "Heliotrope and systems of equations");
    index.add(1, "Equations without the keyword");
    expect(index.search("HELIOTROPE equations")).toEqual([95]);
    expect(index.search("heliotrope absent")).toEqual([]);
  });
  it("does not duplicate resumed pages and drops old-document references", () => {
    const index = new LocalIndex();
    index.add(37, "figure graph");
    index.add(37, "figure graph");
    expect(index.search("figure")).toEqual([37]);
    index.clear();
    expect(index.search("figure")).toEqual([]);
  });
  it("bounds the result set and handles non-Latin words", () => {
    const index = new LocalIndex();
    for (let i = 1; i <= 10; i++) index.add(i, "équations 关系");
    expect(index.search("équations")).toHaveLength(5);
    expect(index.search("关系")[0]).toBe(1);
  });
});
describe("browsable term index", () => {
  it("exposes all references beyond the five-hit search window without duplicating pages", () => {
    const index = new LocalIndex();
    for (let page = 25; page >= 1; page--) {
      index.add(page, "the equations");
      index.add(page, "the equations");
    }
    expect(index.search("equations")).toHaveLength(5);
    expect(index.listTerms().entries).toEqual([
      { term: "equations", count: 25 },
    ]);
    expect(index.termPages("EQUATIONS", 20)).toEqual({
      total: 25,
      pages: [21, 22, 23, 24, 25],
    });
  });
  it("filters extracted terms and clears references with the document", () => {
    const index = new LocalIndex();
    index.add(95, "Heliotrope and equations");
    expect(index.listTerms("helio").entries).toEqual([
      { term: "heliotrope", count: 1 },
    ]);
    index.clear();
    expect(index.listTerms("helio").total).toBe(0);
    expect(index.termPages("heliotrope").pages).toEqual([]);
  });
});

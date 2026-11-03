import { searchTokens } from "./references";
export const LIMITS = {
  fileBytes: 40_000_000,
  pages: 1000,
  textChars: 200000,
  textItems: 20000,
  cachePages: 12,
  cacheChars: 1000000,
  terms: 50000,
  postings: 1000000,
  imageBytes: 512 * 1024,
} as const;
export type PageRef = { documentId: string; page: number; label: string };
export type Source = PageRef & {
  id: string;
  location?: string;
  previewNote?: string;
  kind: "text" | "image";
  text?: string;
  image?: Blob;
  hash?: string;
  width?: number;
  height?: number;
  clipped: boolean;
  textStart?: number;
  totalTextChars?: number;
  nextTextOffset?: number;
};
export type Chapter = { title: string; page: number; depth: number };
export type Coverage = {
  processed: number;
  readable: number;
  unreadable: number;
  failed: number;
  clipped: number;
  limited: boolean;
  paused: boolean;
  total: number;
};
export function resolvePage(
  input: string,
  mode: "pdf" | "book",
  labels: string[],
  unit = "PDF page",
): number {
  if (mode === "pdf") {
    if (!/^\d+$/.test(input.trim()))
      throw new Error(`Enter a whole ${unit.toLowerCase()} number.`);
    const page = Number(input);
    if (page < 1 || page > labels.length)
      throw new Error(
        `Choose a ${unit.toLowerCase()} between 1 and ${labels.length}.`,
      );
    return page;
  }
  const matches = labels.flatMap((label, i) =>
    label.toLowerCase() === input.trim().toLowerCase() ? [i + 1] : [],
  );
  if (!matches.length)
    throw new Error(
      "That book label is not mapped. Use a physical PDF page or correct its label.",
    );
  if (matches.length > 1)
    throw new Error(
      `Ambiguous book label. Matching PDF pages: ${matches.join(", ")}. Choose a physical PDF page.`,
    );
  return matches[0];
}
export const tokens = searchTokens;
export class LocalIndex {
  private words = new Map<string, number[]>();
  private pages = new Set<number>();
  private count = 0;
  limited = false;
  add(page: number, text: string) {
    if (this.pages.has(page)) return;
    this.pages.add(page);
    for (const word of tokens(text)) {
      if (this.count >= LIMITS.postings) {
        this.limited = true;
        break;
      }
      let posting = this.words.get(word);
      if (!posting) {
        if (this.words.size >= LIMITS.terms) {
          this.limited = true;
          continue;
        }
        posting = [];
        this.words.set(word, posting);
      }
      posting.push(page);
      this.count++;
    }
  }
  search(
    query: string,
    offset = 0,
    startPage = 1,
    endPage = Infinity,
  ): number[] {
    const queryTokens = tokens(query).slice(0, 20);
    if (!queryTokens.length) return [];
    const lists = queryTokens.map((word) => this.words.get(word) || []);
    lists.sort((a, b) => a.length - b.length);
    const others = lists.slice(1).map((list) => new Set(list));
    return lists[0]
      .filter(
        (page) =>
          page >= startPage &&
          page <= endPage &&
          others.every((set) => set.has(page)),
      )
      .sort((a, b) => a - b)
      .slice(offset, offset + 5);
  }
  listTerms(query = "", offset = 0) {
    const common = new Set(
      "the and for with this that from have has are was were will would should could into than then their they them your you our its not can but also all any each such which when where what how who these those there here been being some more most only other about through between without within".split(
        " ",
      ),
    );
    const filter = query.trim().toLocaleLowerCase().slice(0, 100);
    const terms = [...this.words.keys()]
      .filter((term) =>
        filter
          ? term.includes(filter)
          : /\p{L}/u.test(term) && !common.has(term),
      )
      .sort((a, b) => a.localeCompare(b));
    const start = Math.max(0, Math.floor(offset));
    return {
      total: terms.length,
      entries: terms
        .slice(start, start + 20)
        .map((term) => ({ term, count: this.words.get(term)!.length })),
    };
  }
  termPages(term: string, offset = 0) {
    const pages = this.words.get(term.trim().toLocaleLowerCase()) || [];
    const ordered = [...pages].sort((a, b) => a - b);
    const start = Math.max(0, Math.floor(offset));
    return { total: ordered.length, pages: ordered.slice(start, start + 20) };
  }
  clear() {
    this.words.clear();
    this.pages.clear();
    this.count = 0;
  }
}

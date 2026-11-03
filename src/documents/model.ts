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
  kind: "text" | "image";
  text?: string;
  image?: Blob;
  hash?: string;
  width?: number;
  height?: number;
  clipped: boolean;
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
): number {
  if (mode === "pdf") {
    if (!/^\d+$/.test(input.trim()))
      throw new Error("Enter a whole physical PDF page number.");
    const page = Number(input);
    if (page < 1 || page > labels.length)
      throw new Error(`Choose a PDF page between 1 and ${labels.length}.`);
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
export function tokens(text: string): string[] {
  return [
    ...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,64}/gu) || []),
  ];
}
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
  search(query: string): number[] {
    const queryTokens = tokens(query).slice(0, 20);
    if (!queryTokens.length) return [];
    const lists = queryTokens.map((word) => this.words.get(word) || []);
    lists.sort((a, b) => a.length - b.length);
    const others = lists.slice(1).map((list) => new Set(list));
    return lists[0]
      .filter((page) => others.every((set) => set.has(page)))
      .slice(0, 5);
  }
  clear() {
    this.words.clear();
    this.pages.clear();
    this.count = 0;
  }
}

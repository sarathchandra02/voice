// Match numeric references without discarding single digits or splitting 9.2.
export function searchTokens(text: string): string[] {
  return [
    ...new Set(
      (
        text
          .normalize("NFKC")
          .toLocaleLowerCase()
          .match(/\d+(?:\s*\.\s*\d+)+|[\p{L}\p{N}]{1,64}/gu) || []
      )
        .map((word) => word.replace(/\s/g, ""))
        .map((word) => (word === "fig" ? "figure" : word)),
    ),
  ];
}

export function figureNumber(value: string): string {
  const number = value
    .normalize("NFKC")
    .trim()
    .replace(/^(?:figure|fig\.?)\s*/i, "")
    .replace(/\s*\.\s*/g, ".");
  if (!/^\d{1,4}(?:\.\d{1,4}){0,3}[a-z]?$/i.test(number))
    throw new Error("Use a figure number such as 9.2 or 9.2a.");
  return number.toLowerCase();
}

export function figureMatch(text: string, number: string) {
  const escaped = number.replace(/\./g, "\\s*\\.\\s*");
  const pattern = new RegExp(
    `\\b(?:figure|fig\\.?)\\s*${escaped}(?![\\p{L}\\p{N}]|\\s*\\.\\s*\\d)`,
    "giu",
  );
  let best:
    | { offset: number; kind: "caption_candidate" | "mention"; score: number }
    | undefined;
  for (const match of text.matchAll(pattern)) {
    const offset = match.index!;
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const prefix = text.slice(lineStart, offset).trim();
    const lineEnd = text.indexOf("\n", offset);
    const line = text.slice(offset, lineEnd < 0 ? text.length : lineEnd);
    const caption = !prefix && !/\.{3,}/.test(line);
    const score = caption ? 2 : 1;
    if (!best || score > best.score)
      best = { offset, kind: caption ? "caption_candidate" : "mention", score };
  }
  return best;
}

export function searchExcerptOffset(text: string, query: string) {
  const queryTerms = searchTokens(query);
  // Prefer the numeric identifier, which usually pinpoints the requested caption.
  const terms = [
    ...queryTerms.filter((term) => /^\d/.test(term)),
    ...queryTerms,
  ];
  for (const term of terms) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${term.replace(/\./g, "\\s*\\.\\s*")}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    const match = pattern.exec(text);
    if (match) return Math.max(0, match.index - 350);
  }
  return 0;
}

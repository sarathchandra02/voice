import type { ReaderDocument } from "./base";
import type { Source } from "./model";
import { figureMatch, figureNumber } from "./references";

type Candidate = {
  page: number;
  offset: number;
  kind: "caption_candidate" | "mention";
  score: number;
};
type Scan = {
  next: number;
  checked: number;
  unreadable: number;
  failed: number;
  clipped: number;
  candidates: Candidate[];
};
// Document-scoped progress survives questions, but never document replacement or reload.
const scans = new WeakMap<ReaderDocument, Map<string, Scan>>();
export async function findFigure(
  doc: ReaderDocument,
  numberInput: string,
  start: number,
  end: number,
  signal: AbortSignal,
  progress?: (message: string) => void,
) {
  const number = figureNumber(numberInput);
  const key = `${number}:${start}:${end}`;
  let entries = scans.get(doc);
  if (!entries) scans.set(doc, (entries = new Map()));
  let scan = entries.get(key);
  if (!scan) {
    if (entries.size >= 8) entries.delete(entries.keys().next().value!);
    entries.set(
      key,
      (scan = {
        next: start,
        checked: 0,
        unreadable: 0,
        failed: 0,
        clipped: 0,
        candidates: [],
      }),
    );
  }
  const check = () => {
    signal.throwIfAborted();
    if (doc.disposed)
      throw new Error("The document was replaced. Start a new conversation.");
  };
  check();
  const deadline = Date.now() + 8000;
  let batch = 0;
  while (scan.next <= end && batch < 250 && Date.now() < deadline) {
    check();
    const page = scan.next;
    try {
      const result = await doc.text(page, signal);
      check();
      if (!result.text.trim()) scan.unreadable++;
      if (result.clipped) scan.clipped++;
      const match = figureMatch(result.text, number);
      if (match) {
        scan.candidates.push({ page, ...match });
        scan.candidates.sort((a, b) => b.score - a.score || a.page - b.page);
        scan.candidates = scan.candidates.slice(0, 5);
      }
    } catch (error) {
      check();
      scan.failed++;
    }
    scan.next++;
    scan.checked++;
    batch++;
    if (batch === 1 || batch % 10 === 0 || scan.next > end) {
      progress?.(
        `Figure ${number}: checked ${scan.checked} of ${end - start + 1} pages locally. ${scan.candidates.length} candidate pages so far.`,
      );
      // Yield between batches so voice interruption remains responsive.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  check();
  const sources: Source[] = [];
  for (const match of scan.candidates) {
    sources.push(
      await doc.read(match.page, signal, {
        offset: Math.max(0, match.offset - 350),
        maxChars: 2500,
      }),
    );
    check();
  }
  const complete = scan.next > end;
  return {
    sources,
    data: {
      figure: number,
      range: { start_pdf_page: start, end_pdf_page: end },
      scan: {
        checked: scan.checked,
        total: end - start + 1,
        complete,
        next_pdf_page: complete ? null : scan.next,
        unreadable: scan.unreadable,
        failed: scan.failed,
        clipped: scan.clipped,
      },
      candidates: scan.candidates.map(
        ({ score: _score, offset: _offset, ...candidate }) => candidate,
      ),
      note: `${complete ? "Text scan of this range finished." : "Call find_figure again with the SAME figure and range to resume without rescanning."} Candidates are text evidence only; inspect the best candidate with read_page format image before describing the figure. Blank, failed, or clipped pages are coverage gaps, not proof of absence. Captions in scanned images require visual inspection or OCR, which this scan does not perform.`,
    },
  };
}

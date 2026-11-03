import type { Chapter } from "./model";
export type WordItem =
  | {
      kind: "text";
      text: string;
      x: number;
      y: number;
      size: number;
      bold: boolean;
      italic: boolean;
    }
  | {
      kind: "image";
      src: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { kind: "cell"; x: number; y: number; width: number; height: number };
export type WordPage = { items: WordItem[]; text: string };
export const WORD_SIZE = { width: 800, height: 1100 };
export function loadLocalImage(
  src: string,
  signal: AbortSignal,
): Promise<HTMLImageElement> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = () => {
      signal.removeEventListener("abort", abort);
      img.onload = null;
      img.onerror = null;
    };
    const abort = () => {
      done();
      img.src = "";
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    img.onload = () => {
      done();
      if (
        !img.naturalWidth ||
        img.naturalWidth * img.naturalHeight > 24_000_000
      )
        reject(new Error("Image exceeds the local preview size limit."));
      else resolve(img);
    };
    img.onerror = () => {
      done();
      reject(new Error("An embedded image could not be rendered."));
    };
    img.src = src;
  });
}
export async function layoutWord(html: string, signal: AbortSignal) {
  const template = document.createElement("template");
  template.innerHTML = html; // Inert fragment, never attached or executed.
  const measure = document.createElement("canvas").getContext("2d")!;
  const pages: WordPage[] = [];
  const chapters: Chapter[] = [];
  let page!: WordPage,
    y = 58,
    lines = 0,
    missingImages = 0;
  let textBudget = 0;
  const newPage = () => {
    if (pages.length >= 1000)
      throw new Error(
        "This Word document exceeds 1,000 reading pages. Split it into smaller files.",
      );
    page = { items: [], text: "" };
    pages.push(page);
    y = 58;
  };
  newPage();
  const space = (height: number) => {
    if (y + height > 1040 && page.items.length) newPage();
  };
  function wrap(
    text: string,
    width: number,
    size: number,
    bold = false,
    italic = false,
  ) {
    measure.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px Arial, sans-serif`;
    const output: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure.measureText(candidate).width <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          output.push(line);
          line = "";
        }
        for (const char of word) {
          if (line && measure.measureText(line + char).width > width) {
            output.push(line);
            line = "";
          }
          line += char;
        }
      }
      output.push(line);
    }
    return output;
  }
  const tick = async () => {
    signal.throwIfAborted();
    if (++lines % 100 === 0) {
      await new Promise((r) => setTimeout(r, 0));
      signal.throwIfAborted();
    }
  };
  function textOf(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (!(node instanceof Element)) return "";
    if (["SCRIPT", "STYLE", "IMG"].includes(node.tagName)) return "";
    if (node.tagName === "BR") return "\n";
    return Array.from(node.childNodes, textOf).join("");
  }
  async function picture(img: Element) {
    const src = img.getAttribute("src") || "";
    if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
      missingImages++;
      return;
    }
    try {
      const image = await loadLocalImage(src, signal);
      const factor = Math.min(
        1,
        684 / image.naturalWidth,
        700 / image.naturalHeight,
      );
      const width = image.naturalWidth * factor,
        height = image.naturalHeight * factor;
      space(height + 18);
      page.items.push({ kind: "image", src, x: 58, y, width, height });
      const alt = img.getAttribute("alt");
      if (alt) page.text += `\n[Image alt text: ${alt}]\n`;
      y += height + 18;
    } catch (error) {
      signal.throwIfAborted();
      missingImages++;
    }
  }
  async function paragraph(node: Element, prefix = "") {
    const text = (prefix + textOf(node)).trim();
    textBudget += text.length;
    if (textBudget > 3_000_000)
      throw new Error(
        "This Word document exceeds the local text limit. Split it into smaller files.",
      );
    const heading = /^H[1-6]$/.test(node.tagName);
    const size = heading ? Math.max(18, 30 - Number(node.tagName[1]) * 2) : 17;
    const bold =
      heading ||
      (!!node.querySelector("strong") &&
        text === node.querySelector("strong")?.textContent?.trim());
    const italic =
      !!node.querySelector("em") &&
      text === node.querySelector("em")?.textContent?.trim();
    if (text) {
      space(size * 2 + 18);
      if (heading)
        chapters.push({
          title: text.slice(0, 200),
          page: pages.length,
          depth: Number(node.tagName[1]) - 1,
        });
      for (const line of wrap(text, 684, size, bold, italic)) {
        await tick();
        space(size * 1.45);
        page.items.push({
          kind: "text",
          text: line,
          x: 58,
          y,
          size,
          bold,
          italic,
        });
        page.text += line + "\n";
        y += size * 1.45;
      }
      y += heading ? 12 : 14;
    }
    for (const img of node.querySelectorAll("img")) await picture(img);
  }
  async function table(node: Element) {
    for (const row of Array.from(node.querySelectorAll("tr"))) {
      const cells = Array.from(row.children).filter(
        (c) => c.tagName === "TD" || c.tagName === "TH",
      );
      if (!cells.length) continue;
      const width = 684 / cells.length;
      // Reading tables preserve every cell, including rows longer than one generated page.
      const values = cells.map((c) => textOf(c).trim());
      textBudget += values.reduce((n, v) => n + v.length, 0);
      if (textBudget > 3_000_000 || cells.length > 30)
        throw new Error(
          "This Word table exceeds the local reading limit. Export it to PDF.",
        );
      const wrapped = values.map((v) => wrap(v, Math.max(10, width - 14), 15));
      const count = Math.max(...wrapped.map((v) => v.length));
      for (let line = 0; line < count; line++) {
        await tick();
        space(26);
        for (let c = 0; c < cells.length; c++) {
          const x = 58 + c * width;
          page.items.push({ kind: "cell", x, y, width, height: 26 });
          page.items.push({
            kind: "text",
            text: wrapped[c][line] || "",
            x: x + 7,
            y: y + 3,
            size: 15,
            bold: cells[c].tagName === "TH",
            italic: false,
          });
        }
        page.text += wrapped.map((v) => v[line] || "").join(" | ") + "\n";
        y += 26;
      }
      for (const img of row.querySelectorAll("img")) await picture(img);
    }
    y += 16;
  }
  async function visit(node: Element) {
    await tick();
    if (node.tagName === "TABLE") return table(node);
    if (node.tagName === "IMG") return picture(node);
    if (/^(P|H[1-6]|BLOCKQUOTE|PRE)$/.test(node.tagName))
      return paragraph(node);
    if (node.tagName === "LI") {
      // Nested lists are visited separately to avoid duplicating their text.
      const copy = node.cloneNode(true) as Element;
      copy.querySelectorAll("ul,ol").forEach((n) => n.remove());
      const index =
        Array.from(node.parentElement?.children || []).indexOf(node) + 1;
      await paragraph(
        copy,
        node.parentElement?.tagName === "OL" ? `${index}. ` : "• ",
      );
      for (const list of Array.from(node.children).filter((c) =>
        /^(UL|OL)$/.test(c.tagName),
      ))
        await visit(list);
      return;
    }
    for (const child of Array.from(node.children)) await visit(child);
  }
  for (const node of Array.from(template.content.children)) await visit(node);
  signal.throwIfAborted();
  if (!pages.some((p) => p.items.length))
    throw new Error(
      "No supported text or images could be read from this Word document. Try exporting it to PDF.",
    );
  return { pages, chapters, missingImages };
}

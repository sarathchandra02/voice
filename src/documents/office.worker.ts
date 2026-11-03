import { unzipSync } from "fflate";
import { parse, renderSlideToSvg, slideText } from "@web-ppt/core";
import mammoth from "mammoth";
import { LIMITS } from "./model";

// No document-controlled network destinations, including linked pictures/fonts.
const localFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.startsWith("blob:") && !url.startsWith("data:"))
    return Promise.reject(
      new Error("External document resources are disabled."),
    );
  return localFetch(input, init);
};
function base64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 16384)
    result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
function checkZip(bytes: Uint8Array, kind: string) {
  let size = 0,
    count = 0,
    valid = false;
  // Inspect the directory before any library inflates the package.
  unzipSync(bytes, {
    filter(file) {
      size += file.originalSize;
      if (
        ++count > 12000 ||
        size > 100_000_000 ||
        file.originalSize > 25_000_000
      )
        throw new Error(
          "This Office file expands beyond the local import limit. Split it into smaller files or export it as PDF.",
        );
      if (
        file.name ===
        (kind === "docx" ? "word/document.xml" : "ppt/presentation.xml")
      )
        valid = true;
      return false;
    },
  });
  if (!valid)
    throw new Error(
      `The file does not contain a valid ${kind.toUpperCase()} document.`,
    );
}
self.onmessage = async (
  event: MessageEvent<{ bytes: ArrayBuffer; kind: "ppt" | "pptx" | "docx" }>,
) => {
  const { bytes, kind } = event.data;
  let presentation: Awaited<ReturnType<typeof parse>> | undefined;
  try {
    if (bytes.byteLength > LIMITS.fileBytes)
      throw new Error("This file is larger than the 40 MB local import limit.");
    const data = new Uint8Array(bytes);
    const zip = data[0] === 0x50 && data[1] === 0x4b;
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (v, i) => data[i] === v,
    );
    if (kind === "ppt" ? !ole : !zip)
      throw new Error(
        "The file format does not match its extension, or it is encrypted. Save an unencrypted copy in its original format and try again.",
      );
    if (zip) checkZip(data, kind);
    if (kind === "docx") {
      const result = await mammoth.convertToHtml(
        { arrayBuffer: bytes },
        {
          externalFileAccess: false,
          includeEmbeddedStyleMap: false,
          convertImage: mammoth.images.imgElement(async (image) => {
            if (!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType))
              return { src: "" };
            const content = await image.readAsArrayBuffer();
            if (content.byteLength > 8_000_000) return { src: "" };
            return {
              src: `data:${image.contentType};base64,${base64(new Uint8Array(content))}`,
            };
          }),
        },
      );
      if (result.value.length > 24_000_000)
        throw new Error(
          "This Word document exceeds the local preview limit. Split it into smaller files or use PDF.",
        );
      self.postMessage({
        ok: true,
        kind,
        html: result.value,
        warnings: result.messages.length,
      });
    } else {
      presentation = await parse(data, {
        lazy: false,
        embeddedFonts: "source",
      });
      if (
        !presentation.slides.length ||
        presentation.slides.length > LIMITS.pages
      )
        throw new Error(
          "PowerPoint files must contain between 1 and 1,000 slides.",
        );
      if (
        ![presentation.width, presentation.height].every(
          (n) => Number.isFinite(n) && n > 0 && n <= 16000,
        )
      )
        throw new Error("This presentation has unsupported slide dimensions.");
      // Inlining only local assets makes the SVG independent of the worker's lifetime.
      const assets = new Map<string, string>();
      let total = 0;
      const slides = [];
      for (const slide of presentation.slides) {
        let svg = renderSlideToSvg(presentation, slide, {
          textMode: "svg",
          includeNotes: false,
          media: "badge",
        });
        for (const url of new Set(svg.match(/blob:[^\s"'<>)]*/g) || [])) {
          let inline = assets.get(url);
          if (!inline) {
            const blob = await (await fetch(url)).blob();
            if (blob.size > 12_000_000)
              throw new Error(
                "A slide image is too large for local preview. Compress the pictures or use PDF.",
              );
            inline = `data:${blob.type};base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`;
            assets.set(url, inline);
          }
          svg = svg.split(url).join(inline);
        }
        total += svg.length;
        if (svg.length > 20_000_000 || total > 120_000_000)
          throw new Error(
            "This presentation exceeds the local preview limit. Compress its images or split the deck.",
          );
        // Speaker notes are not visible slide evidence and are deliberately excluded.
        const text = slideText({ ...slide, notes: undefined });
        slides.push({
          svg,
          text: text.slice(0, LIMITS.textChars),
          clipped: text.length > LIMITS.textChars,
          hidden: !!slide.hidden,
        });
        self.postMessage({
          progress: `Preparing slide ${slides.length} of ${presentation.slides.length}…`,
        });
      }
      self.postMessage({
        ok: true,
        kind,
        width: presentation.width,
        height: presentation.height,
        slides,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Library errors may be localized or contain source paths. Keep the import error actionable.
    const known = /^(This |The file |PowerPoint files |A slide image )/.test(
      message,
    );
    self.postMessage({
      ok: false,
      error: known
        ? message
        : "This Office file could not be read. It may be damaged, password-protected, or use unsupported features. Try saving a fresh copy or exporting to PDF.",
    });
  } finally {
    presentation?.dispose?.();
  }
};

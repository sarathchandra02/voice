import type { Source } from "../documents/model";

// SCTP peers negotiate a maximum message size. Keep each image event below it.
export async function fitImage(
  source: Source,
  maxMessageBytes: number,
  signal: AbortSignal,
): Promise<Source> {
  signal.throwIfAborted();
  if (!source.image) return source;
  const budget = Math.floor(
    (Math.min(maxMessageBytes, 1_000_000) - 4096) * 0.74,
  );
  if (source.image.size <= budget) return source;
  const bitmap = await createImageBitmap(source.image);
  const canvas = document.createElement("canvas");
  try {
    for (const scale of [1, 0.8, 0.6, 0.4]) {
      signal.throwIfAborted();
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Page image encoding is unavailable.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.75, 0.5, 0.3]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        signal.throwIfAborted();
        if (blob && blob.size <= budget) {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await blob.arrayBuffer(),
          );
          signal.throwIfAborted();
          return {
            ...source,
            image: blob,
            width: canvas.width,
            height: canvas.height,
            hash: Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          };
        }
      }
    }
    throw new Error(
      "This image cannot fit the voice connection. Try reading its text.",
    );
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

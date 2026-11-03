import { LIMITS } from "./model";
import type { ReaderDocument } from "./base";
export const DOCUMENT_ACCEPT =
  ".pdf,.ppt,.pptx,.docx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export async function openDocument(
  file: File,
  signal: AbortSignal,
  progress?: (message: string) => void,
): Promise<ReaderDocument> {
  signal.throwIfAborted();
  if (file.size > LIMITS.fileBytes)
    throw new Error("Choose a document up to 40 MB.");
  if (!file.size) throw new Error("This file is empty.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    const { PdfDocument } = await import("./pdf");
    signal.throwIfAborted();
    return PdfDocument.open(file, signal);
  }
  if (extension === "ppt" || extension === "pptx" || extension === "docx") {
    const { OfficeDocument } = await import("./office");
    signal.throwIfAborted();
    return OfficeDocument.open(file, extension, signal, progress);
  }
  throw new Error(
    "Choose a PDF, PowerPoint (.ppt or .pptx), or Word (.docx) file. For older .doc files, save as .docx first.",
  );
}

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
  PDFNumber,
} from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/fixtures", { recursive: true });
const pdf = await PDFDocument.create();
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let number = 1; number <= 100; number++) {
  const page = pdf.addPage([612, 792]);
  page.drawText(
    number === 1
      ? "The Shape of Understanding"
      : number === 37
        ? "Systems of equations"
        : `A field guide to connected ideas`,
    {
      x: 58,
      y: 720,
      font: bold,
      size: number === 1 ? 25 : 21,
      color: rgb(0.16, 0.28, 0.24),
    },
  );
  page.drawText(
    number === 1
      ? "A synthetic textbook for testing local reading"
      : `Chapter notes / Physical page ${number}`,
    { x: 58, y: 687, font: regular, size: 11, color: rgb(0.45, 0.5, 0.43) },
  );
  for (let line = 0; line < 10; line++)
    page.drawText(
      "A relationship becomes clearer when we consider its surrounding context.",
      { x: 58, y: 631 - line * 23, size: 11, font: regular },
    );
  if (number === 37) {
    page.drawText("Figure 3. Comparing two groups", {
      x: 58,
      y: 355,
      size: 13,
      font: bold,
    });
    page.drawRectangle({
      x: 120,
      y: 160,
      width: 90,
      height: 105,
      color: rgb(0.22, 0.48, 0.68),
    });
    page.drawRectangle({
      x: 280,
      y: 160,
      width: 90,
      height: 147,
      color: rgb(0.82, 0.51, 0.25),
    });
    page.drawText("35", { x: 150, y: 276, font: bold, size: 16 });
    page.drawText("49", { x: 310, y: 319, font: bold, size: 16 });
  }
  if (number === 95)
    page.drawText("A unique example: heliotrope connects distant concepts.", {
      x: 58,
      y: 350,
      font: bold,
      size: 12,
    });
  page.drawText(number <= 2 ? ["i", "ii"][number - 1] : String(number - 2), {
    x: 300,
    y: 40,
    font: regular,
    size: 10,
  });
}
const context = pdf.context;
pdf.catalog.set(
  PDFName.of("PageLabels"),
  context.obj({ Nums: [0, { S: "r" }, 2, { S: "D", St: 1 }] }),
);
const outlineRef = context.nextRef();
const itemRef = context.nextRef();
context.assign(
  outlineRef,
  context.obj({ Type: "Outlines", First: itemRef, Last: itemRef, Count: 1 }),
);
context.assign(
  itemRef,
  context.obj({
    Title: PDFString.of("Systems of equations"),
    Parent: outlineRef,
    Dest: [pdf.getPage(36).ref, PDFName.of("Fit")],
  }),
);
pdf.catalog.set(PDFName.of("Outlines"), outlineRef);
await writeFile("public/fixtures/book.pdf", await pdf.save());
const replacement = await PDFDocument.create();
replacement
  .addPage()
  .drawText("A different document. Previous sources must be cleared.", {
    x: 40,
    y: 700,
    size: 14,
  });
await writeFile("public/fixtures/replacement.pdf", await replacement.save());
const ambiguous = await PDFDocument.create();
ambiguous.addPage().drawText("First chapter, page one.");
ambiguous.addPage().drawText("Second chapter, page one.");
ambiguous.catalog.set(
  PDFName.of("PageLabels"),
  ambiguous.context.obj({ Nums: [0, { S: "D", St: 1 }, 1, { S: "D", St: 1 }] }),
);
await writeFile("public/fixtures/ambiguous.pdf", await ambiguous.save());
console.log("Generated three synthetic PDFs; no personal data.");

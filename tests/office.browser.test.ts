import { test, expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";

async function open(page: Page, file: string) {
  await page.goto("/");
  await page
    .getByLabel("Open document file", { exact: true })
    .setInputFiles(`tests/fixtures/${file}`);
  await expect(page.getByTestId("reader-position")).toBeVisible({
    timeout: 20000,
  });
}
for (const extension of ["ppt", "pptx"]) {
  test(`${extension} opens actual slides, searches and retrieves images without moving the reader or sending the file`, async ({
    page,
  }) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      if (
        /^https?:/.test(request.url()) &&
        !request
          .url()
          .startsWith(`http://127.0.0.1:${process.env.TEST_PORT || "5173"}/`)
      )
        external.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, `slides.${extension}`);
    await expect(
      page.getByRole("img", { name: "Slide 1", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("reader-position")).toContainText(
      "Slide 1 of 3",
    );
    await expect(page.getByTestId("format-note")).toContainText(
      "Static PowerPoint preview",
    );
    await page
      .getByRole("button", { name: "Companion options", exact: true })
      .click();
    await page.getByLabel("Search the whole book").fill("heliotrope");
    await page
      .getByRole("button", { name: "Search book", exact: true })
      .click();
    await expect(page.getByTestId("evidence")).toContainText("Slide 2");
    await expect(page.getByTestId("evidence")).not.toContainText(
      "confidential rehearsal",
    );
    await page.getByLabel("Research page number", { exact: true }).fill("2");
    await page.getByRole("button", { name: "View image", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "Locally rendered Slide 2" }),
    ).toBeVisible();
    await expect(page.getByTestId("reader-position")).toContainText(
      "Slide 1 of 3",
    );
    await page.getByRole("button", { name: "Open Slide 2 in reader" }).click();
    await page.keyboard.press("Escape");
    const canvas = page.getByRole("img", { name: "Slide 2", exact: true });
    await expect(canvas).toBeVisible();
    // Confirms embedded artwork survives worker termination, SVG sanitization and rasterization.
    const greenPixels = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 90 &&
          data[i + 1] > data[i] + 15 &&
          data[i + 2] < data[i + 1]
        )
          count++;
      return count;
    });
    expect(greenPixels).toBeGreaterThan(1000);
    if (extension === "pptx")
      await page.screenshot({ path: "/tmp/margin-pptx.png" });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("docx reflows a long document, keeps tables/images and all text searchable with honest reading-page references", async ({
  page,
}) => {
  await open(page, "reading.docx");
  await expect(
    page.getByRole("img", { name: "Reading page 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("format-note")).toContainText("not Word");
  await page.getByText("Selectable page text", { exact: true }).click();
  await expect(page.locator(".extracted-text")).toContainText(
    "café, α, 日本語",
  );
  await expect(page.locator(".extracted-text")).toContainText("Gain | 42");
  await page.screenshot({ path: "/tmp/margin-docx.png" });
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await expect(
    page.getByText("All pages indexed", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search the whole book").fill("ENDMARKER");
  await page.getByRole("button", { name: "Search book", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("ENDMARKER");
  await expect(page.getByTestId("evidence")).toContainText("Reading page");
  await expect(page.getByTestId("reader-position")).toContainText(
    "Reading page 1",
  );
  await page.getByTestId("evidence").getByRole("button").click();
  await expect(page.getByTestId("reader-position")).not.toContainText(
    "Reading page 1 ",
  );
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Open document file", { exact: true })
    .setInputFiles("public/fixtures/replacement.pdf");
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("format-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear document" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
});
test("Office voice tools retrieve slide text, figures, images and format context; disposed imports are unusable", async ({
  page,
}) => {
  await page.goto("/");
  const bytes = Array.from(readFileSync("tests/fixtures/slides.ppt"));
  const result = await page.evaluate(async (bytes) => {
    const openPath = "/src/documents/open.ts";
    const toolsPath = "/src/voice/tools.ts";
    const { openDocument } = (await import(
      /* @vite-ignore */ openPath
    )) as typeof import("../src/documents/open");
    const { DocumentTools, documentInstructions } = (await import(
      /* @vite-ignore */ toolsPath
    )) as typeof import("../src/voice/tools");
    const signal = new AbortController().signal;
    const doc = await openDocument(
      new File([new Uint8Array(bytes)], "slides.ppt"),
      signal,
    );
    await doc.startIndex();
    const tools = new DocumentTools(doc, 2);
    const current = await tools.run(
      "current_page",
      '{"format":"text"}',
      signal,
    );
    const figure = await tools.run("find_figure", '{"number":"9.2"}', signal);
    const visual = await tools.run(
      "read_page",
      '{"page":"2","numbering":"pdf","format":"image"}',
      signal,
    );
    const instruction = documentInstructions(doc);
    doc.dispose();
    let blocked = false;
    try {
      await doc.image(1, signal);
    } catch {
      blocked = true;
    }
    return {
      text: current.sources[0].text,
      unit: current.data.location_unit,
      location: visual.sources[0].location,
      bytes: visual.sources[0].image!.size,
      candidates: figure.sources.map((s: { page: number }) => s.page),
      instruction,
      blocked,
      sources: doc.sources.size,
    };
  }, bytes);
  expect(result.text).toContain("heliotrope");
  expect(result.unit).toBe("Slide");
  expect(result.location).toBe("Slide 2");
  expect(result.bytes).toBeGreaterThan(1000);
  expect(result.candidates).toContain(2);
  expect(result.instruction).toContain("Static PowerPoint preview");
  expect(result.blocked).toBe(true);
  expect(result.sources).toBe(0);
});
test("invalid, mismatched, and excessive Office archives fail clearly and allow another file", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByLabel("Open document file", { exact: true });
  for (const file of [
    { name: "bad.ppt", buffer: Buffer.from("bad") },
    {
      name: "bad.docx",
      buffer: Buffer.from(zipSync({ "wrong.xml": strToU8("<x/>") })),
    },
    {
      name: "large.pptx",
      buffer: Buffer.from(
        zipSync({ "ppt/presentation.xml": new Uint8Array(26_000_000) }),
      ),
    },
  ]) {
    await picker.setInputFiles({
      ...file,
      mimeType: "application/octet-stream",
    });
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open a document/ }),
    ).toBeEnabled();
  }
  await expect(page.getByRole("alert")).toContainText("expands beyond");
  await picker.setInputFiles("tests/fixtures/slides.pptx");
  await expect(
    page.getByRole("img", { name: "Slide 1", exact: true }),
  ).toBeVisible();
});
test("cancelling an Office import or replacing it does not resurrect the old document", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/office.worker.ts*", async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  const picker = page.getByLabel("Open document file", { exact: true });
  await picker.setInputFiles("tests/fixtures/slides.pptx");
  await page
    .getByRole("button", { name: "Cancel opening", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Open a document/ }),
  ).toBeVisible();
  await picker.setInputFiles("tests/fixtures/slides.ppt");
  await picker.setInputFiles("public/fixtures/replacement.pdf");
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId("reader-position")).toContainText(
    "PDF page 1 of 1",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

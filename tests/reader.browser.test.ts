import { test, expect, type Page } from "@playwright/test";
const file = "public/fixtures/book.pdf";
async function open(page: Page, path = file) {
  await page.goto("/");
  await page.getByLabel("Open PDF file", { exact: true }).setInputFiles(path);
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
}
test("local reading renders, searches the whole book, and inspects off-screen evidence without moving the reader", async ({
  page,
}) => {
  const failures: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173") &&
      !request.url().startsWith("blob:") &&
      !request.url().startsWith("data:")
    )
      unexpectedRequests.push(request.url());
    if (request.method() !== "GET") unexpectedRequests.push(request.method());
  });
  await open(page);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await expect(
    page.getByText("All pages indexed", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search the whole book").fill("heliotrope");
  await page.getByRole("button", { name: "Search book", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("heliotrope");
  await expect(page.getByTestId("reader-position")).toContainText(
    "PDF page 1 of 100",
  );
  await page.getByLabel("Research page number", { exact: true }).fill("37");
  await page.getByRole("button", { name: "View image", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Locally rendered PDF page 37" }),
  ).toBeVisible();
  await expect(page.getByTestId("reader-position")).toContainText(
    "PDF page 1 of 100",
  );
  await page
    .getByRole("button", { name: "Open PDF page 37 in reader" })
    .click();
  await expect(
    page.getByRole("img", { name: "PDF page 37", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to reading" }).click();
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
test("shared book label resolution handles front matter and does not confuse physical numbering", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Page numbering", { exact: true }).selectOption("book");
  await page.getByLabel("Page number", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "PDF page 37", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("reader-position")).toContainText("Book 35");
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByLabel("Research page numbering").selectOption("book");
  await page.getByLabel("Research page number", { exact: true }).fill("ii");
  await page.getByRole("button", { name: "Read text", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("Book ii · PDF 2");
  await expect(page.getByTestId("reader-position")).toContainText(
    "PDF page 37",
  );
});
test("chapter lookup and sequential research preserve page, zoom and scroll", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  await page.getByTestId("page-scroller").evaluate((el) => {
    el.scrollTop = 120;
  });
  const before = await page
    .getByTestId("page-scroller")
    .evaluate((el) => el.scrollTop);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByText("Chapters & bookmarks").click();
  await page.getByRole("button", { name: /Systems of equations/ }).click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 37");
  await page.getByRole("button", { name: "Inspect next page" }).click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 38");
  expect(
    await page.getByTestId("page-scroller").evaluate((el) => el.scrollTop),
  ).toBe(before);
  await expect(page.getByTestId("reader-position")).toContainText("PDF page 1");
  await page.getByRole("button", { name: "Close companion options" }).click();
  await page.getByRole("button", { name: "Collapse companion" }).click();
  await page.getByRole("button", { name: "Expand companion" }).click();
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 38");
  expect(
    await page.getByTestId("page-scroller").evaluate((el) => el.scrollTop),
  ).toBe(before);
});
test("direct retrieval works while indexing is paused", async ({ page }) => {
  await open(page);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Research page number", { exact: true }).fill("95");
  await page.getByRole("button", { name: "Read text", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("heliotrope");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByText("All pages indexed", { exact: true }),
  ).toBeVisible();
});
test("duplicate book labels require clarification", async ({ page }) => {
  await open(page, "public/fixtures/ambiguous.pdf");
  await page.getByLabel("Page numbering", { exact: true }).selectOption("book");
  await page.getByLabel("Page number", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ambiguous book label");
  await expect(page.getByTestId("reader-position")).toContainText("PDF page 1");
});
test("replace during retrieval discards old sources, and clear releases the reader", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByLabel("Research page number", { exact: true }).fill("37");
  await page.getByRole("button", { name: "View image", exact: true }).click();
  await page
    .getByLabel("Open PDF file", { exact: true })
    .setInputFiles("public/fixtures/replacement.pdf");
  await expect(page.getByTestId("reader-position")).toContainText(
    "PDF page 1 of 1",
  );
  await expect(page.getByTestId("evidence")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Reading context · PDF page 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear document" }).click();
  await expect(page.getByRole("button", { name: /Open a PDF/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
test("invalid files leave the picker usable", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open PDF file", { exact: true }).setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("valid PDF");
  await expect(page.getByRole("button", { name: /Open a PDF/ })).toBeEnabled();
});
test("mobile layout keeps local reading and research controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByLabel("Research page number", { exact: true }).fill("37");
  await page.getByRole("button", { name: "Read text", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 37");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("rapid page turns prepare only the settled context and do not start a provider request", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") posts.push(request.url());
  });
  await open(page);
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "PDF page 5", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Reading context · PDF page 5",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".reading-context")).toContainText("PDF page 5");
  expect(posts).toEqual([]);
});
test("missing book labels are not silently treated as physical page numbers", async ({
  page,
}) => {
  await open(page, "public/fixtures/replacement.pdf");
  await page.getByLabel("Page numbering", { exact: true }).selectOption("book");
  await page.getByLabel("Page number", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not mapped");
  await page.getByText("Page numbering", { exact: true }).click();
  await page.getByLabel("Correct book label").fill("93");
  await page.getByRole("button", { name: "Save label", exact: true }).click();
  await expect(page.getByTestId("reader-position")).toContainText("Book 93");
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByLabel("Research page numbering").selectOption("book");
  await page.getByLabel("Research page number", { exact: true }).fill("93");
  await page.getByRole("button", { name: "Read text", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("Book 93 · PDF 1");
});
test("conversation is the default surface with honest local context and inspectable page inputs", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("Search the whole book")).not.toBeVisible();
  await expect(
    page.getByRole("img", { name: "Voice companion idle" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Microphone off", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("separator", { name: "Resize reader" }),
  ).toHaveAttribute("aria-valuenow", "60");
  const history = page.getByRole("log", {
    name: "Conversation and activity history",
  });
  await expect(
    history.getByRole("heading", {
      name: "Reading context · PDF page 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(history).toContainText("has not been sent to AI");
  await history.getByTestId("history-source").locator("summary").click();
  await expect(
    history.getByRole("img", { name: "Local context image of PDF page 1" }),
  ).toBeVisible();
  await expect(page.getByTestId("reader-position")).toContainText("PDF page 1");
});
test("options support Escape and restore focus; local lookups appear in conversation history", async ({
  page,
}) => {
  await open(page);
  const trigger = page.getByRole("button", {
    name: "Companion options",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Book tools" })).toBeVisible();
  await page.getByLabel("Research page number", { exact: true }).fill("37");
  await page.getByRole("button", { name: "View image", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 37");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  const history = page.getByRole("log");
  await expect(history).toContainText("View image · PDF page 37");
  await expect(history).toContainText("Sources retrieved");
  await expect(history).toContainText("Nothing was sent to AI");
  await history
    .getByTestId("history-source")
    .filter({ hasText: "PDF page 37" })
    .locator("summary")
    .click();
  await expect(
    history.getByRole("img", { name: "Local context image of PDF page 37" }),
  ).toBeVisible();
  await expect(page.getByTestId("reader-position")).toContainText("PDF page 1");
});
test("new activity does not drag a user away from older conversation entries", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  for (const number of ["37", "38", "39"]) {
    await page.getByLabel("Research page number", { exact: true }).fill(number);
    await page.getByRole("button", { name: "Read text", exact: true }).click();
    await expect(page.getByTestId("evidence")).toContainText(`PDF ${number}`);
  }
  await page.keyboard.press("Escape");
  const history = page.getByRole("log");
  await history.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await page
    .getByRole("button", { name: "Companion options", exact: true })
    .click();
  await page.getByLabel("Research page number", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Read text", exact: true }).click();
  await expect(page.getByTestId("evidence")).toContainText("PDF 40");
  await page.keyboard.press("Escape");
  expect(await history.evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "New activity" }).click();
  expect(
    await history.evaluate(
      (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
    ),
  ).toBeLessThan(3);
});

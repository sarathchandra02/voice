import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile("design-lab/previews/design-gallery.html");
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
let passed = 0;
try {
  for (const design of ["air", "focus", "studio"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const network = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(base + "#" + design);
    await expect(
      page.getByRole("heading", { name: "Finding common ground." }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByLabel("OpenAI API key preview")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Connection settings", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Start talking", exact: true })
      .click();
    await expect(
      page.getByText("ONE-TIME SETUP", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("OpenAI API key preview")
      .fill("dummy-test-value-not-a-secret");
    await page.getByRole("button", { name: "Use demo connection" }).click();
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain("dummy-test-value");
    await page.reload();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Start talking", exact: true })
      .click();
    await expect(
      page.getByText("Listening · preview", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mute preview", exact: true })
      .click();
    await expect(
      page.getByText("Paused · preview", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "End preview", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Book tools and options", exact: true })
      .click();
    await page.getByLabel("Search sample book").fill("equations");
    await page.getByRole("button", { name: /Sample result for/ }).click();
    await expect(page.locator(".page-count")).toContainText("Book page 93");
    await expect(page.getByText("Sample source · book page 37")).toBeVisible();
    await page.getByLabel("Type a sample message").fill("Explain this sample.");
    await page
      .getByRole("button", { name: "Send sample message", exact: true })
      .click();
    await expect(page.getByRole("log")).toContainText(
      "This is an interactive design preview.",
    );
    await page
      .getByRole("button", { name: "Connection settings", exact: true })
      .click();
    await page.getByLabel("OpenAI API key preview").fill("second-dummy-value");
    await page
      .getByRole("button", { name: "Update demo connection", exact: true })
      .click();
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain("second-dummy-value");
    await page
      .getByRole("button", { name: "Connection settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Forget demo connection", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Connection settings", exact: true }),
    ).toBeVisible();
    expect(network.filter((url) => url !== base)).toEqual([]);
    await context.close();
    passed++;
    console.log(
      `PASS ${design}: offline UI, setup/update/forget, no stored key, voice simulation, lookup, typed input, mobile width.`,
    );
  }
  expect(errors).toEqual([]);
  console.log(
    `${passed} self-contained design flows passed; no external requests or browser errors.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

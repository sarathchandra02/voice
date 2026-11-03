import { test, expect, type Page } from "@playwright/test";

async function simulate(
  page: Page,
  options: {
    fail?: number;
    delayedMic?: boolean;
    noKey?: boolean;
    noAck?: boolean;
    fixture?: string;
    model?: string;
  } = {},
) {
  await page.addInitScript((opts) => {
    const w = window as any;
    if (!opts.noKey)
      localStorage.setItem("margin.openai-key.v1", "test-only-not-a-real-key");
    if (opts.model) localStorage.setItem("margin.voice-model.v1", opts.model);
    w.voiceTest = { sent: [], tracks: [], calls: [], pendingMic: null };
    const fakeStream = () => {
      const track = {
        enabled: true,
        readyState: "live",
        onended: null,
        stop() {
          this.readyState = "ended";
        },
      };
      w.voiceTest.tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] } as any;
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        if (opts.delayedMic)
          return new Promise((resolve) => {
            w.voiceTest.pendingMic = () => resolve(fakeStream());
          });
        return fakeStream();
      },
    });
    class Peer {
      connectionState = "new";
      iceGatheringState = "complete";
      localDescription: any;
      onconnectionstatechange: any;
      ontrack: any;
      channel: any;
      sender = { replaceTrack: async (_track: any) => {} };
      addTrack() {
        return this.sender;
      }
      createDataChannel() {
        const channel = (this.channel = {
          readyState: "connecting",
          bufferedAmount: 0,
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          send(data: string) {
            const event = JSON.parse(data);
            w.voiceTest.sent.push(event);
            // Mirror the documented Realtime client item-ID constraint instead
            // of accepting payloads that the real provider can reject.
            if (
              event.type === "conversation.item.create" &&
              (typeof event.item.id !== "string" ||
                !/^[a-zA-Z0-9_-]{1,32}$/.test(event.item.id))
            ) {
              setTimeout(
                () =>
                  w.voiceTest.emit({
                    type: "error",
                    error: {
                      code: "invalid_value",
                      param: "item.id",
                      event_id: event.event_id,
                      message: "Invalid item.id: maximum length 32.",
                    },
                  }),
                0,
              );
              return;
            }
            if (!opts.noAck && event.type === "conversation.item.create")
              setTimeout(
                () =>
                  w.voiceTest.emit({
                    type: "conversation.item.added",
                    item: event.item,
                  }),
                0,
              );
          },
          close() {
            this.readyState = "closed";
            this.onclose?.();
          },
        });
        w.voiceTest.emit = (event: any) =>
          channel.onmessage?.({ data: JSON.stringify(event) });
        return channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "test-offer" };
      }
      async setLocalDescription(offer: any) {
        this.localDescription = offer;
      }
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.channel.readyState = "open";
        w.voiceTest.emit({
          type:
            opts.model === "gpt-live-1" ? "session.started" : "session.created",
          session: { type: "realtime", model: opts.model },
        });
      }
      close() {
        this.connectionState = "closed";
        this.onconnectionstatechange?.();
      }
    }
    w.RTCPeerConnection = Peer;
  }, options);
  await page.route("https://api.openai.com/**", async (route) => {
    const request = route.request();
    await page.evaluate(
      ({ url, body }) => (window as any).voiceTest.calls.push({ url, body }),
      { url: request.url(), body: request.postData() },
    );
    if (options.fail)
      await route.fulfill({
        status: options.fail,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "do not show test-only-not-a-real-key" },
        }),
      });
    else if (request.url().endsWith("/live/sessions"))
      await route.fulfill({
        json: {
          session: { id: "live_test" },
          transport: { type: "webrtc", sdp: "test-answer" },
        },
      });
    else if (request.url().endsWith("client_secrets"))
      await route.fulfill({ json: { value: "ek_test-only" } });
    else
      await route.fulfill({
        contentType: "application/sdp",
        body: "test-answer",
      });
  });
  await page.goto("/");
  await page
    .getByLabel("Open document file", { exact: true })
    .setInputFiles(options.fixture || "public/fixtures/book.pdf");
  await expect(
    page.getByRole("img", {
      name: /^(PDF page|Slide|Reading page) 1$/,
      exact: true,
    }),
  ).toBeVisible();
}
async function start(page: Page) {
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
}
async function emit(page: Page, event: unknown) {
  await page.evaluate((value) => (window as any).voiceTest.emit(value), event);
}
async function sent(page: Page, type: string) {
  return page.evaluate(
    (type) =>
      (window as any).voiceTest.sent.filter(
        (event: any) => event.type === type,
      ),
    type,
  );
}
async function question(page: Page, item = "speech_1") {
  await emit(page, {
    type: "input_audio_buffer.speech_started",
    item_id: item,
  });
  await emit(page, { type: "input_audio_buffer.committed", item_id: item });
  const requests = await sent(page, "response.create");
  const turn = requests.at(-1).response.metadata.turn;
  const response = { id: `response_${item}`, metadata: { turn } };
  await emit(page, { type: "response.created", response });
  return response;
}

test("explicit start, transcripts, mute, unmute and stop own the microphone lifecycle", async ({
  page,
}) => {
  await simulate(page);
  expect(await page.evaluate(() => (window as any).voiceTest.calls)).toEqual(
    [],
  );
  await start(page);
  const calls = await page.evaluate(() => (window as any).voiceTest.calls);
  expect(calls.map((call: any) => call.url)).toEqual([
    "https://api.openai.com/v1/realtime/client_secrets",
    "https://api.openai.com/v1/realtime/calls",
  ]);
  expect(
    JSON.parse(calls[0].body).session.audio.input.turn_detection
      .create_response,
  ).toBe(false);
  const response = await question(page);
  await emit(page, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "speech_1",
    transcript: "Explain this page.",
  });
  await emit(page, {
    type: "response.output_audio_transcript.delta",
    response_id: response.id,
    item_id: "answer_1",
    delta: "Let's look ",
  });
  await emit(page, {
    type: "response.output_audio_transcript.done",
    response_id: response.id,
    item_id: "answer_1",
    transcript: "Let's look at your page.",
  });
  await expect(
    page.getByText("Explain this page.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Let's look at your page.", { exact: true }),
  ).toBeVisible();
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [],
      usage: { input_tokens: 15, output_tokens: 9 },
    },
  });
  await expect(page.locator(".dock-note")).toContainText(
    "15 input / 9 output tokens",
  );
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  await page
    .getByRole("button", { name: "Unmute microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mute microphone", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop voice", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).voiceTest.tracks.every(
        (track: any) => track.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
});

test("current-page tools stay bound to the question while the reader moves and only share on demand", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  const response = await question(page);
  await page.getByLabel("Page number", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "PDF page 5", exact: true }),
  ).toBeVisible();
  expect((await sent(page, "conversation.item.create")).length).toBe(0);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "lookup_1",
          name: "current_page",
          arguments: JSON.stringify({ format: "image" }),
        },
        {
          type: "function_call",
          call_id: "lookup_2",
          name: "read_page",
          arguments: JSON.stringify({
            page: "37",
            numbering: "pdf",
            format: "text",
          }),
        },
      ],
    },
  });
  await expect(
    page.getByText("Page image sent", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Text excerpt sent", { exact: true }),
  ).toBeVisible();
  const items = await sent(page, "conversation.item.create");
  const image = items.find((event: any) =>
    event.item.content?.some((part: any) => part.type === "input_image"),
  );
  expect(image.item.content[0].text).toContain("physical PDF page 1");
  expect(image.item.content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
  const outputs = items.filter(
    (event: any) => event.item.type === "function_call_output",
  );
  expect(JSON.parse(outputs[1].item.output).sources[0].page).toBe(37);
  const imageCard = page.getByTestId("activity").filter({
    has: page.getByRole("heading", { name: "Page image sent", exact: true }),
  });
  await imageCard.locator("summary").click();
  await expect(imageCard).toContainText("Rendered page image · JPEG");
  await expect(imageCard).toContainText("Received by OpenAI");
  const textCard = page.getByTestId("activity").filter({
    has: page.getByRole("heading", {
      name: "Text excerpt sent",
      exact: true,
    }),
  });
  await textCard.locator("summary").click();
  const excerpt = JSON.parse(outputs[1].item.output).sources[0].text;
  await expect(textCard).toContainText(
    `Extracted text · ${excerpt.length.toLocaleString()} characters`,
  );
  await expect(textCard).toContainText("No page image included.");
  await expect(
    textCard.locator(".history-source-body > p").filter({ hasText: excerpt }),
  ).toBeVisible();
  expect(excerpt.length).toBeLessThanOrEqual(2500);

  expect((await sent(page, "response.create")).length).toBe(2);
  await expect(
    page.getByRole("img", { name: "PDF page 5", exact: true }),
  ).toBeVisible();
});

test("stop during a microphone permission prompt cleans up the late track and makes no API request", async ({
  page,
}) => {
  await simulate(page, { delayedMic: true });
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  await page.evaluate(() => (window as any).voiceTest.pendingMic());
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).voiceTest.tracks[0]?.readyState),
    )
    .toBe("ended");
  expect(await page.evaluate(() => (window as any).voiceTest.calls)).toEqual(
    [],
  );
});

test("API failures stop capture and never echo credential-bearing provider errors", async ({
  page,
}) => {
  await simulate(page, { fail: 401 });
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "OpenAI rejected the key",
  );
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  await expect(page.locator("body")).not.toContainText(
    "test-only-not-a-real-key",
  );
});

test("missing key opens settings without requesting the microphone", async ({
  page,
}) => {
  await simulate(page, { noKey: true });
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "A voice for your reading." }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).voiceTest.tracks)).toEqual(
    [],
  );
});

test("document replacement stops capture and rejects late provider events", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  const response = await question(page);
  await page
    .getByLabel("Open document file", { exact: true })
    .setInputFiles("public/fixtures/replacement.pdf");
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  await emit(page, {
    type: "response.output_audio_transcript.done",
    response_id: response.id,
    item_id: "stale",
    transcript: "OLD DOCUMENT RESPONSE",
  });
  await expect(page.locator("body")).not.toContainText("OLD DOCUMENT RESPONSE");
  expect(
    await page.evaluate(() =>
      (window as any).voiceTest.tracks.every(
        (track: any) => track.readyState === "ended",
      ),
    ),
  ).toBe(true);
});

test("interruption cancels a pending source receipt without a stale continuation", async ({
  page,
}) => {
  await simulate(page, { noAck: true });
  await start(page);
  const response = await question(page);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "pending",
          name: "read_page",
          arguments: '{"page":"37","numbering":"pdf","format":"text"}',
        },
      ],
    },
  });
  await expect(
    page.getByText("Waiting for OpenAI to confirm receipt.", { exact: true }),
  ).toBeVisible();
  const output = (await sent(page, "conversation.item.create")).at(-1);
  await emit(page, {
    type: "input_audio_buffer.speech_started",
    item_id: "speech_2",
  });
  await emit(page, { type: "conversation.item.added", item: output.item });
  await expect(
    page.getByText("Source delivery unconfirmed", { exact: true }),
  ).toBeVisible();
  expect((await sent(page, "response.create")).length).toBe(1);
  await emit(page, {
    type: "input_audio_buffer.committed",
    item_id: "speech_2",
  });
  expect((await sent(page, "response.create")).length).toBe(2);
});

test("removing a key stops an active session", async ({ page }) => {
  await simulate(page);
  await start(page);
  await page
    .getByRole("button", { name: "Connection settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove saved key", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
});

test("backgrounding stops capture and does not reconnect automatically", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
});

test("an interrupted response cannot append late assistant transcript deltas", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  const old = await question(page);
  await emit(page, {
    type: "input_audio_buffer.speech_started",
    item_id: "new_question",
  });
  await emit(page, {
    type: "response.output_audio_transcript.delta",
    response_id: old.id,
    item_id: "late",
    delta: "STALE ANSWER",
  });
  await emit(page, {
    type: "input_audio_buffer.committed",
    item_id: "new_question",
  });
  expect((await sent(page, "response.create")).length).toBe(1);
  await emit(page, {
    type: "response.done",
    response: { ...old, status: "cancelled", output: [] },
  });
  expect((await sent(page, "response.create")).length).toBe(2);
  await expect(page.locator("body")).not.toContainText("STALE ANSWER");
});

test("typed questions and duplicate completed tool events do not duplicate lookup or continuation", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  await page.getByLabel("Message your companion").fill("Find quasarneedle.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const requests = await sent(page, "response.create");
  const response = {
    id: "typed_response",
    metadata: requests.at(-1).response.metadata,
  };
  await emit(page, { type: "response.created", response });
  // Wait for the local progressive index to finish this small synthetic book.
  await expect
    .poll(async () => page.locator(".reading-context").innerText())
    .toContain("PDF page 1");
  const done = {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "chapters",
          name: "list_chapters",
          arguments: '{"query":""}',
        },
      ],
    },
  };
  await emit(page, done);
  await emit(page, done);
  await expect(
    page.getByText("Document lookup returned", { exact: true }),
  ).toBeVisible();
  expect(
    (await sent(page, "conversation.item.create")).filter(
      (event: any) => event.item.type === "function_call_output",
    ),
  ).toHaveLength(1);
  expect((await sent(page, "response.create")).length).toBe(2);
});

test("permission denial does not make an API request", async ({ page }) => {
  await simulate(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    }),
  );
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Microphone permission was denied",
  );
  expect(await page.evaluate(() => (window as any).voiceTest.calls)).toEqual(
    [],
  );
});

test("provider event errors stop the microphone and show a retry state", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  await emit(page, {
    type: "error",
    error: { code: "server_error", message: "test-only-not-a-real-key" },
  });
  await expect(page.getByRole("alert")).toContainText(
    "OpenAI rejected a voice event",
  );
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  await expect(page.locator("body")).not.toContainText(
    "test-only-not-a-real-key",
  );
});

test("voice controls remain usable on a phone-sized viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulate(page);
  await start(page);
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/voice-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Stop voice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/voice-desktop.png", fullPage: true });
});

test("large page images are reduced to fit the negotiated data-channel limit", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/voice/images.ts";
    const { fitImage } = await import(modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(800, 800);
    let seed = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), "image/png"),
    );
    const source = await fitImage(
      {
        id: "test",
        documentId: "test",
        page: 1,
        label: "1",
        kind: "image",
        image: blob,
        clipped: false,
      },
      65536,
      new AbortController().signal,
    );
    return {
      original: blob.size,
      reduced: source.image!.size,
      width: source.width,
      hash: source.hash,
    };
  });
  expect(result.original).toBeGreaterThan(65536);
  expect(result.reduced).toBeLessThan((65536 - 4096) * 0.74);
  expect(result.width).toBeGreaterThan(0);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

test("a rejected source reports its safe cause and leaves voice connected", async ({
  page,
}) => {
  await simulate(page, { noAck: true });
  await start(page);
  const response = await question(page);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "rejected_lookup",
          name: "current_page",
          arguments: '{"format":"text"}',
        },
      ],
    },
  });
  await expect(
    page.getByText("Waiting for OpenAI to confirm receipt.", { exact: true }),
  ).toBeVisible();
  const output = (await sent(page, "conversation.item.create")).at(-1);
  await emit(page, {
    type: "error",
    error: {
      event_id: output.event_id,
      code: "invalid_value",
      param: "item.id",
      message: "test-only-not-a-real-key MUST NOT APPEAR",
    },
  });
  await expect(
    page.getByText("Source rejected by OpenAI", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#voice-availability")).toContainText(
    "invalid_value; field item.id",
  );
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("MUST NOT APPEAR");
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("live");
  expect((await sent(page, "response.create")).length).toBe(1);
  await question(page, "retry_question");
  expect((await sent(page, "response.create")).length).toBe(2);
});

test("unconfirmed source timeout keeps voice alive without continuing from missing evidence", async ({
  page,
}) => {
  await page.clock.install();
  await simulate(page, { noAck: true });
  await start(page);
  const response = await question(page);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "timeout_lookup",
          name: "current_page",
          arguments: '{"format":"text"}',
        },
      ],
    },
  });
  await expect(
    page.getByText("Waiting for OpenAI to confirm receipt.", { exact: true }),
  ).toBeVisible();
  const output = (await sent(page, "conversation.item.create")).at(-1);
  await page.clock.fastForward(10_001);
  await expect(page.locator("#voice-availability")).toContainText(
    "within 10 seconds",
  );
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
  await emit(page, { type: "conversation.item.added", item: output.item });
  expect((await sent(page, "response.create")).length).toBe(1);
});

test("stop reply cancels playback without ending voice and ignores stale events", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulate(page);
  await start(page);
  await expect(page.locator(".voice-dock h3")).toHaveText("Listening");
  const response = await question(page);
  await expect(page.locator(".voice-dock h3")).toHaveText("Thinking…");
  await emit(page, {
    type: "output_audio_buffer.started",
    response_id: response.id,
  });
  await expect(page.locator(".voice-dock h3")).toHaveText("Speaking");
  await page
    .getByRole("button", { name: "Stop reply", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Stop reply", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "/tmp/voice-speaking-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop reply", exact: true }).click();
  expect((await sent(page, "response.cancel")).at(-1).response_id).toBe(
    response.id,
  );
  expect(await sent(page, "output_audio_buffer.clear")).toHaveLength(1);
  await emit(page, {
    type: "output_audio_buffer.cleared",
    response_id: response.id,
  });
  await emit(page, {
    type: "output_audio_buffer.started",
    response_id: response.id,
  });
  await emit(page, {
    type: "response.output_audio_transcript.delta",
    response_id: response.id,
    item_id: "obsolete",
    delta: "Obsolete answer",
  });
  await emit(page, {
    type: "response.done",
    response: { ...response, status: "cancelled", output: [] },
  });
  await expect(page.locator(".voice-dock h3")).toHaveText("Listening");
  await expect(page.getByText("Obsolete answer")).toHaveCount(0);
  expect(await sent(page, "response.create")).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("live");
  await question(page, "speech_next");
  expect(await sent(page, "response.create")).toHaveLength(2);
  await expect(page.locator(".voice-dock h3")).toHaveText("Thinking…");
});

test("stop reply cancels an outstanding source receipt and keeps muted voice available", async ({
  page,
}) => {
  await simulate(page, { noAck: true });
  await start(page);
  const response = await question(page);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "current_page",
          call_id: "stop_lookup",
          arguments: JSON.stringify({ format: "text" }),
        },
      ],
    },
  });
  await expect(
    page.getByText("Sharing sources", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop reply", exact: true }).click();
  await expect(page.locator(".voice-dock h3")).toHaveText("Microphone muted");
  await expect(
    page.getByText("Source delivery unconfirmed", { exact: true }),
  ).toBeVisible();
  for (const event of await sent(page, "conversation.item.create"))
    await emit(page, { type: "conversation.item.added", item: event.item });
  expect(await sent(page, "response.create")).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unmute microphone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("figure search scans the whole PDF, shares the late caption, then verifies its page image without moving the reader", async ({
  page,
}) => {
  await simulate(page, { fixture: "public/fixtures/figures.pdf" });
  await start(page);
  const response = await question(page);
  await emit(page, {
    type: "response.done",
    response: {
      ...response,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "find_figure_1",
          name: "find_figure",
          arguments: JSON.stringify({ number: "9.2" }),
        },
      ],
    },
  });
  await expect(
    page.getByText("Text excerpts sent", { exact: true }),
  ).toBeVisible();
  const items = await sent(page, "conversation.item.create");
  const result = JSON.parse(
    items.find((event: any) => event.item.call_id === "find_figure_1").item
      .output,
  );
  expect(result.scan).toMatchObject({
    checked: 30,
    complete: true,
    unreadable: 0,
    failed: 0,
  });
  expect(result.candidates.map((c: any) => c.page)).toEqual([27, 3]);
  expect(result.sources[0]).toMatchObject({
    page: 27,
    label: "21",
    kind: "text",
  });
  expect(result.sources[0].textStart).toBeGreaterThan(2500);
  expect(result.sources[0].text).toContain("Figure 9.2: Regression residuals");
  expect(result.sources[0].text.length).toBeLessThanOrEqual(2500);
  expect(
    items.some((event: any) =>
      event.item.content?.some((part: any) => part.type === "input_image"),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Checked 30 of 30 pages locally/)).toBeVisible();
  const turn = (await sent(page, "response.create")).at(-1).response.metadata
    .turn;
  const next = { id: "figure_image_response", metadata: { turn } };
  await emit(page, { type: "response.created", response: next });
  await emit(page, {
    type: "response.done",
    response: {
      ...next,
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "figure_image",
          name: "read_page",
          arguments: JSON.stringify({
            page: "27",
            numbering: "pdf",
            format: "image",
          }),
        },
      ],
    },
  });
  await expect(
    page.getByText("Page image sent", { exact: true }),
  ).toBeVisible();
  const image = (await sent(page, "conversation.item.create")).find(
    (event: any) =>
      event.item.content?.some((part: any) => part.type === "input_image"),
  );
  expect(image.item.content[0].text).toContain("physical PDF page 27");
  expect(image.item.content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  const card = page.getByTestId("activity").filter({
    has: page.getByRole("heading", {
      name: "Text excerpts sent",
      exact: true,
    }),
  });
  await card.locator("summary").first().click();
  await expect(card).toContainText("Figure 9.2: Regression residuals");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/figure-search-desktop.png",
    fullPage: true,
  });
});

test("search excerpts surround exact figure matches and page text supports continuation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const pdfPath = "/src/documents/pdf.ts";
    const toolsPath = "/src/voice/tools.ts";
    const { PdfDocument } = await import(/* @vite-ignore */ pdfPath);
    const { DocumentTools } = await import(/* @vite-ignore */ toolsPath);
    const bytes = await (await fetch("/fixtures/figures.pdf")).blob();
    const signal = new AbortController().signal;
    const doc = await PdfDocument.open(
      new File([bytes], "figures.pdf"),
      signal,
    );
    try {
      for (let p = 1; p <= 30; p++)
        doc.index.add(p, (await doc.text(p, signal)).text);
      const tools = new DocumentTools(doc, 1);
      const search = await tools.run(
        "search_book",
        JSON.stringify({ query: "Figure 9.2" }),
        signal,
      );
      const first = await tools.run(
        "read_page",
        JSON.stringify({ page: "27", numbering: "pdf", format: "text" }),
        signal,
      );
      const second = await tools.run(
        "read_page",
        JSON.stringify({
          page: "27",
          numbering: "pdf",
          format: "text",
          text_offset: first.sources[0].nextTextOffset,
        }),
        signal,
      );
      return { search, first: first.sources[0], second: second.sources[0] };
    } finally {
      doc.dispose();
    }
  });
  expect(result.search.sources.map((s: any) => s.page)).toEqual([3, 27]);
  expect(result.search.sources[1].text).toContain(
    "Figure 9.2: Regression residuals",
  );
  expect(result.first.text).not.toContain("Figure 9.2: Regression residuals");
  expect(result.first.nextTextOffset).toBe(2500);
  expect(result.second.text).toContain("Figure 9.2: Regression residuals");
  expect(result.second.textStart).toBe(2500);
});

test("provider picker cancels without changing the running model and never reuses the OpenAI key for Gemini", async ({
  page,
}) => {
  await simulate(page);
  await start(page);
  const picker = page.getByLabel("Voice model", { exact: true });
  await picker.selectOption("gemini-3.8-live");
  const setup = page.getByRole("group", { name: "Set up Google Gemini" });
  await expect(setup).toContainText("Your OpenAI key cannot connect to Gemini");
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveValue("gpt-realtime-2.1");
  await expect(
    page.getByRole("button", { name: "Stop voice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("live");
  await picker.selectOption("gemini-3.8-live");
  await setup
    .getByLabel("Google Gemini API key", { exact: true })
    .fill("sk-wrong-provider");
  await setup.getByRole("button", { name: "Save and switch" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Gemini requires its own",
  );
  await setup
    .getByLabel("Google Gemini API key", { exact: true })
    .fill("AIza-test-only-gemini");
  await setup.getByRole("button", { name: "Save and switch" }).click();
  await expect(picker).toHaveValue("gemini-3.8-live");
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("margin.openai-key.v1")),
  ).toBe("test-only-not-a-real-key");
  expect(
    await page.evaluate(() => localStorage.getItem("margin.gemini-key.v1")),
  ).toBe("AIza-test-only-gemini");
  expect(
    await page.evaluate(() => (window as any).voiceTest.calls.length),
  ).toBe(2);
  await picker.selectOption("gpt-realtime-2.1-mini");
  await expect(setup).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.scrollIntoViewIfNeeded();
  await expect(picker).toBeInViewport();
  await page.screenshot({
    path: "/tmp/model-picker-mobile.png",
    fullPage: true,
  });
});

test("selected realtime model reaches OpenAI and the provider-reported model is visible", async ({
  page,
}) => {
  await simulate(page, { model: "gpt-realtime-2.1-mini" });
  await start(page);
  expect(
    await page.evaluate(
      () => JSON.parse((window as any).voiceTest.calls[0].body).session.model,
    ),
  ).toBe("gpt-realtime-2.1-mini");
  await expect(page.getByTestId("session-model")).toContainText(
    "Provider confirmed: gpt-realtime-2.1-mini",
  );
  await page
    .getByLabel("Voice model", { exact: true })
    .selectOption("gpt-realtime-2.1");
  await expect(
    page.getByRole("button", { name: "Start voice", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("session-model")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
});

test("GPT-Live uses its own endpoint and document backend, sends tools without claiming receipts, and closes cleanly", async ({
  page,
}) => {
  await simulate(page, { model: "gpt-live-1" });
  await start(page);
  const calls = await page.evaluate(() => (window as any).voiceTest.calls);
  expect(calls.map((c: any) => c.url)).toEqual([
    "https://api.openai.com/v1/live/sessions",
  ]);
  const payload = JSON.parse(calls[0].body);
  expect(payload.session.model).toBe("gpt-live-1");
  expect(payload.session.delegation.responses.model).toBe("gpt-6-luna");
  await expect(page.getByTestId("session-model")).toContainText("gpt-live-1");
  await emit(page, {
    type: "session.delegation.created",
    delegation: { id: "delegation_test", target: "responses" },
  });
  await emit(page, {
    type: "response.event",
    delegation_id: "delegation_test",
    event: {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "live_page",
        name: "current_page",
        arguments: '{"format":"text"}',
      },
    },
  });
  await emit(page, {
    type: "response.event",
    delegation_id: "delegation_test",
    event: { type: "response.completed", response: { output: [] } },
  });
  await expect(
    page.getByText("Text excerpts sent", { exact: true }),
  ).toBeVisible();
  const output = (await sent(page, "response.item.create")).find(
    (e: any) => e.item.call_id === "live_page",
  );
  expect(JSON.parse(output.item.output).sources[0].page).toBe(1);
  await expect(
    page.getByText(
      /This connection does not confirm individual source receipts/,
    ),
  ).toBeVisible();
  expect(await sent(page, "response.create")).toHaveLength(1);
  await page.getByRole("button", { name: "Stop voice", exact: true }).click();
  expect(await sent(page, "session.close")).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  await emit(page, { type: "session.closed" });
});

test("Gemini uses only the Google connection, returns document tools, and releases microphone and audio resources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    localStorage.setItem("margin.gemini-key.v1", "AIza-test-only-google");
    w.googleTest = { sent: [], contexts: [], url: "" };
    class Node {
      port: any = {};
      gain = { value: 0 };
      connect() {}
      disconnect() {}
    }
    class Context {
      state = "running";
      currentTime = 0;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      constructor() {
        w.googleTest.contexts.push(this);
      }
      async resume() {
        this.state = "running";
      }
      async close() {
        this.state = "closed";
      }
      createGain() {
        return new Node();
      }
      createMediaStreamSource() {
        return new Node();
      }
      createBuffer(_channels: number, length: number, rate: number) {
        return {
          duration: length / rate,
          getChannelData: () => new Float32Array(length),
        };
      }
      createBufferSource() {
        return {
          connect() {},
          disconnect() {},
          stop() {},
          start() {},
          buffer: null,
          onended: null,
        };
      }
    }
    w.AudioContext = Context;
    w.AudioWorkletNode = Node;
    class Socket {
      static OPEN = 1;
      readyState = 1;
      bufferedAmount = 0;
      onopen: any;
      onmessage: any;
      onclose: any;
      onerror: any;
      constructor(url: string) {
        w.googleTest.url = url;
        w.googleTest.emit = (value: any) =>
          this.onmessage?.({ data: JSON.stringify(value) });
        setTimeout(() => this.onopen?.(), 0);
      }
      send(value: string) {
        const event = JSON.parse(value);
        w.googleTest.sent.push(event);
        if (event.setup)
          setTimeout(() => w.googleTest.emit({ setupComplete: {} }), 0);
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }
    w.WebSocket = Socket;
  });
  await simulate(page, { model: "gemini-3.8-live" });
  await start(page);
  const connection = await page.evaluate(() => ({
    url: (window as any).googleTest.url,
    sent: (window as any).googleTest.sent,
    openaiCalls: (window as any).voiceTest.calls,
  }));
  expect(connection.url).toContain("generativelanguage.googleapis.com");
  expect(connection.url).toContain("AIza-test-only-google");
  expect(connection.url).not.toContain("test-only-not-a-real-key");
  expect(connection.openaiCalls).toEqual([]);
  expect(connection.sent[0].setup.model).toBe("models/gemini-3.8-live");
  await expect(page.getByTestId("session-model")).toContainText(
    "Requested model: gemini-3.8-live",
  );
  await page.evaluate(() =>
    (window as any).googleTest.emit({
      toolCall: {
        functionCalls: [
          { id: "google_page", name: "current_page", args: { format: "text" } },
        ],
      },
    }),
  );
  await expect(
    page.getByText("Text excerpts sent", { exact: true }),
  ).toBeVisible();
  const tool = await page.evaluate(() =>
    (window as any).googleTest.sent.find((event: any) => event.toolResponse),
  );
  expect(tool.toolResponse.functionResponses[0].response.sources[0].page).toBe(
    1,
  );
  await expect(
    page.getByText(/Sent to Google Gemini. This connection/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop voice", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).voiceTest.tracks[0].readyState),
  ).toBe("ended");
  expect(
    await page.evaluate(() => (window as any).googleTest.contexts[0].state),
  ).toBe("closed");
});

test("the Gemini capture worklet produces bounded PCM frames in a real browser audio context", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 16000 });
    await context.audioWorklet.addModule("/voice-capture.worklet.js");
    const capture = new AudioWorkletNode(context, "voice-capture");
    const oscillator = context.createOscillator();
    const silence = context.createGain();
    silence.gain.value = 0;
    oscillator.connect(capture);
    capture.connect(silence);
    silence.connect(context.destination);
    try {
      const frame = new Promise<ArrayBuffer>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Audio frame timeout")),
          5000,
        );
        capture.port.onmessage = (e) => {
          clearTimeout(timeout);
          resolve(e.data);
        };
      });
      await context.resume();
      oscillator.start();
      const bytes = await frame;
      const samples = new Int16Array(bytes);
      return {
        length: bytes.byteLength,
        nonzero: samples.some((x) => x !== 0),
      };
    } finally {
      oscillator.stop();
      oscillator.disconnect();
      capture.disconnect();
      silence.disconnect();
      await context.close();
    }
  });
  expect(result).toEqual({ length: 3200, nonzero: true });
});

for (const [file, unit] of [
  ["slides.ppt", "Slide"],
  ["reading.docx", "Reading page"],
]) {
  test(`${file} voice session sends correctly labeled text and preview images, and replacement stops capture`, async ({
    page,
  }) => {
    await simulate(page, { fixture: `tests/fixtures/${file}` });
    await start(page);
    const response = await question(page);
    await emit(page, {
      type: "response.done",
      response: {
        ...response,
        status: "completed",
        output: [
          {
            type: "function_call",
            call_id: "office_text",
            name: "current_page",
            arguments: '{"format":"text"}',
          },
          {
            type: "function_call",
            call_id: "office_image",
            name: "current_page",
            arguments: '{"format":"image"}',
          },
        ],
      },
    });
    await expect(
      page.getByText("Page image sent", { exact: true }),
    ).toBeVisible();
    const items = await sent(page, "conversation.item.create");
    const output = items
      .filter((e: any) => e.item.type === "function_call_output")
      .map((e: any) => JSON.parse(e.item.output));
    expect(output).toHaveLength(2);
    expect(output[0].location_unit).toBe(unit);
    expect(output[0].sources[0].text.length).toBeGreaterThan(10);
    expect(output[1].sources[0].location).toBe(`${unit} 1`);
    expect(output[1].preview_note).toContain("preview");
    const image = items.find((e: any) =>
      e.item.content?.some((p: any) => p.type === "input_image"),
    );
    expect(image.item.content[0].text).toContain(`${unit} 1`);
    expect(image.item.content[0].text).not.toContain("PDF");
    expect(image.item.content[1].image_url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    await page
      .getByLabel("Open document file", { exact: true })
      .setInputFiles("public/fixtures/replacement.pdf");
    await expect(
      page.getByRole("img", { name: "PDF page 1", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as any).voiceTest.tracks.every(
          (track: any) => track.readyState === "ended",
        ),
      ),
    ).toBe(true);
  });
}

import { test, expect, type Page } from "@playwright/test";

async function simulate(
  page: Page,
  options: {
    fail?: number;
    delayedMic?: boolean;
    noKey?: boolean;
    noAck?: boolean;
  } = {},
) {
  await page.addInitScript((opts) => {
    const w = window as any;
    if (!opts.noKey)
      localStorage.setItem("margin.openai-key.v1", "test-only-not-a-real-key");
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
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.channel.readyState = "open";
        w.voiceTest.emit({
          type: "session.created",
          session: { type: "realtime" },
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
    .getByLabel("Open PDF file", { exact: true })
    .setInputFiles("public/fixtures/book.pdf");
  await expect(
    page.getByRole("img", { name: "PDF page 1", exact: true }),
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
    page.getByText("Sources shared with OpenAI", { exact: true }),
  ).toHaveCount(2);
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
    .getByLabel("Open PDF file", { exact: true })
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

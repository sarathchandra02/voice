import { describe, expect, it } from "vitest";
import { providerDiagnostic, realtimeItemId } from "../src/voice/protocol";

describe("Realtime wire identifiers and safe errors", () => {
  it("creates unique item IDs within the provider's 32-character constraint", () => {
    const ids = Array.from({ length: 1000 }, realtimeItemId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]{1,32}$/);
  });
  it("preserves useful schema diagnostics without exposing provider messages", () => {
    const error = {
      code: "invalid_value",
      param: "item.id",
      message: "secret user text",
    };
    expect(providerDiagnostic(error)).toBe("invalid_value; field item.id");
    expect(
      providerDiagnostic({
        code: "invalid_image",
        param: "item.content[1].image_url",
      }),
    ).toBe("invalid_image; field item.content[1].image_url");
  });
  it("does not echo arbitrary codes or fields containing secrets", () => {
    expect(providerDiagnostic({ code: "sk-secret", param: "sk-secret" })).toBe(
      "unrecognized_error",
    );
    expect(providerDiagnostic({ code: {}, param: ["item.id"] })).toBe(
      "unrecognized_error",
    );
  });
});

// Realtime client item IDs are limited to 32 characters. A full UUID without
// separators retains its randomness and fits; adding "item_" exceeds the limit.
export const realtimeItemId = () => crypto.randomUUID().replaceAll("-", "");

export class SourceDeliveryError extends Error {
  constructor(
    message: string,
    readonly reason: "rejected" | "timeout" | "send",
  ) {
    super(message);
  }
}

// Provider messages can echo request data. Expose only known diagnostic codes
// and schema field names, never the raw message, key, transcript, or image.
const safeCodes = new Set([
  "invalid_value",
  "invalid_request_error",
  "invalid_argument",
  "invalid_parameter",
  "invalid_event",
  "invalid_image",
  "invalid_image_format",
  "image_parse_error",
  "unsupported_value",
  "string_above_max_length",
  "context_length_exceeded",
  "rate_limit_exceeded",
  "insufficient_quota",
  "server_error",
]);
export function providerDiagnostic(error: { code?: unknown; param?: unknown }) {
  const code =
    typeof error.code === "string" && safeCodes.has(error.code)
      ? error.code
      : "unrecognized_error";
  const param =
    typeof error.param === "string" &&
    /^item\.(id|type|role|call_id|output|content(?:\[\d{1,2}\]|\.\d{1,2})?\.(image_url|type|text|detail))$/.test(
      error.param,
    )
      ? `; field ${error.param}`
      : "";
  return `${code}${param}`;
}

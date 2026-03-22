import { describe, expect, test } from "vitest";
import { errorResponse, wrapGmailError } from "./error-handler.js";

describe("errorResponse", () => {
  test("returns error format", () => {
    const result = errorResponse("Something failed");
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: Something failed" }],
      isError: true,
    });
  });
});

describe("wrapGmailError", () => {
  test("404 returns not found with resource name", () => {
    const err = { code: 404, message: "Not Found" };
    const result = wrapGmailError(err, "Message");
    expect(result.content[0].text).toBe("Error: Message not found");
    expect(result.isError).toBe(true);
  });

  test("404 uses default resource name", () => {
    const err = { code: 404, message: "Not Found" };
    const result = wrapGmailError(err);
    expect(result.content[0].text).toBe("Error: Resource not found");
  });

  test("400 includes original message", () => {
    const err = { code: 400, message: "Invalid ID format" };
    const result = wrapGmailError(err);
    expect(result.content[0].text).toBe(
      "Error: Invalid request: Invalid ID format",
    );
  });

  test("403 returns insufficient permissions", () => {
    const err = { code: 403, message: "Forbidden" };
    const result = wrapGmailError(err);
    expect(result.content[0].text).toBe("Error: Insufficient permissions");
  });

  test("429 returns rate limit message", () => {
    const err = { code: 429, message: "Too Many Requests" };
    const result = wrapGmailError(err);
    expect(result.content[0].text).toBe(
      "Error: Rate limited — try again later",
    );
  });

  test("unknown error returns message", () => {
    const err = { code: 500, message: "Internal Server Error" };
    const result = wrapGmailError(err);
    expect(result.content[0].text).toBe("Error: Internal Server Error");
  });

  test("handles non-object error", () => {
    const result = wrapGmailError("something broke");
    expect(result.content[0].text).toBe("Error: something broke");
  });
});

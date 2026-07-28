import { describe, expect, test } from "vitest";
import {
  chunk,
  decodeBase64Url,
  extractHeaders,
  extractTextBody,
  mapWithConcurrency,
  stripHtml,
} from "./utils.js";

describe("chunk", () => {
  test("splits into chunks of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns a single chunk when smaller than the size", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  test("returns no chunks for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });
});

describe("mapWithConcurrency", () => {
  test("keeps results in input order", async () => {
    const delays = [30, 0, 10];
    const results = await mapWithConcurrency(delays, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(results).toEqual(delays);
  });

  test("never exceeds the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    expect(peak).toBe(3);
  });

  test("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
  });

  test("rejects when a task rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("extractHeaders", () => {
  test("extracts all headers", () => {
    const headers = [
      { name: "From", value: "alice@example.com" },
      { name: "To", value: "bob@example.com" },
      { name: "Subject", value: "Hello" },
      { name: "Date", value: "Mon, 1 Jan 2024 00:00:00 +0000" },
    ];
    expect(extractHeaders(headers)).toEqual({
      from: "alice@example.com",
      to: "bob@example.com",
      subject: "Hello",
      date: "Mon, 1 Jan 2024 00:00:00 +0000",
    });
  });

  test("returns empty strings for missing headers", () => {
    expect(extractHeaders([])).toEqual({
      from: "",
      to: "",
      subject: "",
      date: "",
    });
  });

  test("returns empty strings for undefined input", () => {
    expect(extractHeaders(undefined)).toEqual({
      from: "",
      to: "",
      subject: "",
      date: "",
    });
  });

  test("handles case-insensitive header names", () => {
    const headers = [
      { name: "from", value: "alice@example.com" },
      { name: "SUBJECT", value: "Test" },
    ];
    expect(extractHeaders(headers)).toEqual({
      from: "alice@example.com",
      to: "",
      subject: "Test",
      date: "",
    });
  });

  test("handles null name/value", () => {
    const headers = [
      { name: null, value: null },
      { name: "From", value: "alice@example.com" },
    ];
    expect(extractHeaders(headers)).toEqual({
      from: "alice@example.com",
      to: "",
      subject: "",
      date: "",
    });
  });
});

describe("decodeBase64Url", () => {
  test("decodes base64url string", () => {
    const encoded = Buffer.from("Hello, World!").toString("base64url");
    expect(decodeBase64Url(encoded)).toBe("Hello, World!");
  });

  test("handles UTF-8 characters", () => {
    const encoded = Buffer.from("日本語テスト").toString("base64url");
    expect(decodeBase64Url(encoded)).toBe("日本語テスト");
  });
});

describe("extractTextBody", () => {
  const encode = (text: string) => Buffer.from(text).toString("base64url");

  test("extracts direct text/plain body", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: encode("Hello") },
    };
    expect(extractTextBody(payload)).toBe("Hello");
  });

  test("extracts text/plain from multipart", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encode("Plain text") },
        },
        {
          mimeType: "text/html",
          body: { data: encode("<p>HTML</p>") },
        },
      ],
    };
    expect(extractTextBody(payload)).toBe("Plain text");
  });

  test("falls back to text/html when no text/plain", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/html",
          body: { data: encode("<p>HTML content</p>") },
        },
      ],
    };
    expect(extractTextBody(payload)).toBe("HTML content");
  });

  test("recurses into nested multipart", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/plain",
              body: { data: encode("Nested plain") },
            },
          ],
        },
      ],
    };
    expect(extractTextBody(payload)).toBe("Nested plain");
  });

  test("falls back to top-level HTML body", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: encode("<b>Bold</b>") },
    };
    expect(extractTextBody(payload)).toBe("Bold");
  });

  test("returns empty string for empty payload", () => {
    expect(extractTextBody({})).toBe("");
  });

  test("returns empty string when no body data", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: null },
    };
    expect(extractTextBody(payload)).toBe("");
  });
});

describe("stripHtml", () => {
  test("removes HTML tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  test("removes style blocks", () => {
    expect(
      stripHtml('<style type="text/css">body{color:red}</style>Hello'),
    ).toBe("Hello");
  });

  test("removes script blocks", () => {
    expect(stripHtml("<script>alert('hi')</script>Hello")).toBe("Hello");
  });

  test("converts <br> to newline", () => {
    expect(stripHtml("Hello<br>World")).toBe("Hello\nWorld");
    expect(stripHtml("Hello<br/>World")).toBe("Hello\nWorld");
    expect(stripHtml("Hello<br />World")).toBe("Hello\nWorld");
  });

  test("converts </p> to double newline", () => {
    expect(stripHtml("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  test("decodes HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39; &nbsp;")).toBe("& < > \" '");
  });

  test("collapses excessive newlines", () => {
    expect(stripHtml("A\n\n\n\n\nB")).toBe("A\n\nB");
  });

  test("trims whitespace", () => {
    expect(stripHtml("  <p>Hello</p>  ")).toBe("Hello");
  });
});

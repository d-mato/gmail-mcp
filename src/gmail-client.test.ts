import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  batchModify: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        messages: {
          batchModify: mocks.batchModify,
          get: mocks.get,
          list: mocks.list,
        },
      },
    }),
  },
}));

const { GmailClient } = await import("./gmail-client.js");

// The client only forwards this to the mocked googleapis factory.
const auth = {} as ConstructorParameters<typeof GmailClient>[0];

function messageResponse(id: string) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      snippet: "",
      payload: { headers: [] },
      labelIds: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batchModify.mockResolvedValue({ data: {} });
});

describe("batchModifyMessages", () => {
  test("relabels every message in a single request", async () => {
    await new GmailClient(auth).batchModifyMessages(["a", "b"], [], ["INBOX"]);

    expect(mocks.batchModify).toHaveBeenCalledTimes(1);
    expect(mocks.batchModify.mock.calls[0][0]).toEqual({
      userId: "me",
      requestBody: {
        ids: ["a", "b"],
        addLabelIds: [],
        removeLabelIds: ["INBOX"],
      },
    });
  });

  test("splits ids into chunks of 1000", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `id-${i}`);

    await new GmailClient(auth).batchModifyMessages(ids, ["TRASH"], []);

    expect(mocks.batchModify).toHaveBeenCalledTimes(3);
    const sent = mocks.batchModify.mock.calls.map(
      ([params]) => params.requestBody.ids,
    );
    expect(sent.map((c: string[]) => c.length)).toEqual([1000, 1000, 500]);
    expect(sent.flat()).toEqual(ids);
  });

  test("sends nothing for an empty id list", async () => {
    await new GmailClient(auth).batchModifyMessages([], ["TRASH"], []);

    expect(mocks.batchModify).not.toHaveBeenCalled();
  });
});

describe("searchMessages", () => {
  test("bounds how many messages are fetched at once", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    mocks.list.mockResolvedValue({
      data: { messages: ids.map((id) => ({ id })) },
    });

    let inFlight = 0;
    let peak = 0;
    mocks.get.mockImplementation(async ({ id }: { id: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return messageResponse(id);
    });

    const messages = await new GmailClient(auth).searchMessages(
      "is:unread",
      20,
    );

    expect(peak).toBeLessThanOrEqual(5);
    expect(messages.map((m) => m.id)).toEqual(ids);
  });
});

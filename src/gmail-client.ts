import { type gmail_v1, google } from "googleapis";
import {
  type AttachmentInfo,
  chunk,
  extractAttachments,
  extractHeaders,
  extractTextBody,
  type MessageHeader,
  mapWithConcurrency,
} from "./utils.js";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Gmail enforces a per-user concurrent request limit on top of the per-user
 * rate limit, and answers bursts with HTTP 429 "Too many requests: Too many
 * concurrent requests for user". Keeping the fan-out small is what avoids it.
 * https://developers.google.com/gmail/api/guides/handle-errors
 */
const SEARCH_CONCURRENCY = 5;

/** `users.messages.batchModify` accepts at most 1000 ids per request. */
const BATCH_MODIFY_MAX_IDS = 1000;

/**
 * Gmail asks for exponential backoff starting at least one second after a rate
 * limit error, which is slower than the gaxios default of 100ms.
 */
const RETRY_CONFIG = {
  retry: 5,
  retryDelay: 1000,
};

/**
 * gaxios only retries idempotent HTTP methods by default, so Gmail's write
 * calls — all POSTs — never retry on 429. Replaying them is safe: a request
 * rejected with 429 was never applied. Other failures are left alone.
 */
const WRITE_OPTIONS = {
  retryConfig: {
    ...RETRY_CONFIG,
    httpMethodsToRetry: ["GET", "HEAD", "PUT", "OPTIONS", "DELETE", "POST"],
    statusCodesToRetry: [[429, 429]],
  },
};

export interface MessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  headers: MessageHeader;
  labelIds: string[];
}

export interface MessageDetail extends MessageSummary {
  body: string;
  attachments: AttachmentInfo[];
}

export interface ThreadDetail {
  id: string;
  messages: MessageDetail[];
}

export interface SearchResult {
  messages: MessageSummary[];
  nextPageToken?: string;
}

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({
      version: "v1",
      auth,
      retryConfig: RETRY_CONFIG,
    });
  }

  async searchMessages(
    query: string,
    maxResults: number = 10,
    pageToken?: string,
  ): Promise<SearchResult> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults, 50),
      pageToken,
    });

    const nextPageToken = res.data.nextPageToken ?? undefined;
    const messageIds = res.data.messages ?? [];
    if (messageIds.length === 0) return { messages: [], nextPageToken };

    const messages = await mapWithConcurrency(
      messageIds.filter((m): m is { id: string } => m.id != null),
      SEARCH_CONCURRENCY,
      async ({ id }) => {
        const msg = await this.gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const data = msg.data;
        if (!data.id || !data.threadId) {
          throw new Error(`Invalid message data for id: ${id}`);
        }
        return {
          id: data.id,
          threadId: data.threadId,
          snippet: data.snippet ?? "",
          headers: extractHeaders(data.payload?.headers),
          labelIds: data.labelIds ?? [],
        };
      },
    );

    return { messages, nextPageToken };
  }

  async getMessage(
    messageId: string,
    format: "full" | "metadata" | "minimal" = "full",
  ): Promise<MessageDetail> {
    const msg = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format,
    });

    const body =
      format === "full" && msg.data.payload
        ? extractTextBody(msg.data.payload)
        : (msg.data.snippet ?? "");

    const data = msg.data;
    if (!data.id || !data.threadId) {
      throw new Error(`Invalid message data for id: ${messageId}`);
    }
    return {
      id: data.id,
      threadId: data.threadId,
      snippet: data.snippet ?? "",
      headers: extractHeaders(data.payload?.headers),
      labelIds: data.labelIds ?? [],
      body,
      attachments:
        format === "full" && data.payload
          ? extractAttachments(data.payload)
          : [],
    };
  }

  async getThread(threadId: string): Promise<ThreadDetail> {
    const res = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const data = res.data;
    if (!data.id) {
      throw new Error(`Invalid thread data for id: ${threadId}`);
    }

    const messages: MessageDetail[] = (data.messages ?? []).map((msg) => {
      if (!msg.id || !msg.threadId) {
        throw new Error(`Invalid message data in thread: ${threadId}`);
      }
      const body = msg.payload ? extractTextBody(msg.payload) : "";
      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet ?? "",
        headers: extractHeaders(msg.payload?.headers),
        labelIds: msg.labelIds ?? [],
        body,
        attachments: msg.payload ? extractAttachments(msg.payload) : [],
      };
    });

    return { id: data.id, messages };
  }

  async modifyMessage(
    messageId: string,
    addLabelIds: string[] = [],
    removeLabelIds: string[] = [],
  ): Promise<void> {
    await this.gmail.users.messages.modify(
      {
        userId: "me",
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      },
      WRITE_OPTIONS,
    );
  }

  /**
   * Relabels many messages with a single API call per 1000 ids, instead of one
   * call per message. Sends the chunks sequentially so a large id list can't
   * trip Gmail's per-user concurrency limit.
   *
   * Gmail reports no per-message result for this endpoint, so a chunk either
   * succeeds as a whole or throws.
   */
  async batchModifyMessages(
    messageIds: string[],
    addLabelIds: string[] = [],
    removeLabelIds: string[] = [],
  ): Promise<void> {
    for (const ids of chunk(messageIds, BATCH_MODIFY_MAX_IDS)) {
      await this.gmail.users.messages.batchModify(
        {
          userId: "me",
          requestBody: { ids, addLabelIds, removeLabelIds },
        },
        WRITE_OPTIONS,
      );
    }
  }

  async trashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.trash(
      {
        userId: "me",
        id: messageId,
      },
      WRITE_OPTIONS,
    );
  }

  async untrashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.untrash(
      {
        userId: "me",
        id: messageId,
      },
      WRITE_OPTIONS,
    );
  }

  async modifyThread(
    threadId: string,
    addLabelIds: string[] = [],
    removeLabelIds: string[] = [],
  ): Promise<void> {
    await this.gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  async trashThread(threadId: string): Promise<void> {
    await this.gmail.users.threads.trash({
      userId: "me",
      id: threadId,
    });
  }

  async untrashThread(threadId: string): Promise<void> {
    await this.gmail.users.threads.untrash({
      userId: "me",
      id: threadId,
    });
  }

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = res.data.data;
    if (!data) {
      throw new Error(`No data for attachment ${attachmentId}`);
    }
    return Buffer.from(data, "base64url");
  }

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    const res = await this.gmail.users.labels.list({ userId: "me" });
    return res.data.labels ?? [];
  }

  async createLabel(name: string): Promise<gmail_v1.Schema$Label> {
    const res = await this.gmail.users.labels.create({
      userId: "me",
      requestBody: { name },
    });
    return res.data;
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.gmail.users.labels.delete({
      userId: "me",
      id: labelId,
    });
  }
}

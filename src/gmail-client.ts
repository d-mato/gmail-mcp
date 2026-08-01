import { type gmail_v1, google } from "googleapis";
import {
  extractHeaders,
  extractTextBody,
  type MessageHeader,
} from "./utils.js";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export interface MessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  headers: MessageHeader;
  labelIds: string[];
}

export interface MessageDetail extends MessageSummary {
  body: string;
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
    this.gmail = google.gmail({ version: "v1", auth });
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

    const messages = await Promise.all(
      messageIds
        .filter((m): m is { id: string } => m.id != null)
        .map(async ({ id }) => {
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
        }),
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
      };
    });

    return { id: data.id, messages };
  }

  async modifyMessage(
    messageId: string,
    addLabelIds: string[] = [],
    removeLabelIds: string[] = [],
  ): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  async trashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    });
  }

  async untrashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.untrash({
      userId: "me",
      id: messageId,
    });
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

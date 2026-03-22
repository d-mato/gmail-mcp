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

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async searchMessages(
    query: string,
    maxResults: number = 10,
  ): Promise<MessageSummary[]> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults, 50),
    });

    const messageIds = res.data.messages ?? [];
    if (messageIds.length === 0) return [];

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

    return messages;
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

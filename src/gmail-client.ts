import { type gmail_v1, google } from "googleapis";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

interface MessageHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
}

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

function extractHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
): MessageHeader {
  const get = (name: string) =>
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";
  return {
    from: get("From"),
    to: get("To"),
    subject: get("Subject"),
    date: get("Date"),
  };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractTextBody(payload: gmail_v1.Schema$MessagePart): string {
  // Direct body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — recurse
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to text/html with tag stripping
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }

  // Fallback: HTML body at top level
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  GmailClient,
  MessageDetail,
  MessageSummary,
  ThreadDetail,
} from "../gmail-client.js";
import { wrapGmailError } from "./error-handler.js";

function formatMessageSummary(msg: MessageSummary): string {
  return [
    `ID: ${msg.id}`,
    `Thread: ${msg.threadId}`,
    `From: ${msg.headers.from}`,
    `To: ${msg.headers.to}`,
    `Subject: ${msg.headers.subject}`,
    `Date: ${msg.headers.date}`,
    `Labels: ${msg.labelIds.join(", ")}`,
    `Snippet: ${msg.snippet}`,
  ].join("\n");
}

function formatMessageDetail(msg: MessageDetail): string {
  return [
    `ID: ${msg.id}`,
    `Thread: ${msg.threadId}`,
    `From: ${msg.headers.from}`,
    `To: ${msg.headers.to}`,
    `Subject: ${msg.headers.subject}`,
    `Date: ${msg.headers.date}`,
    `Labels: ${msg.labelIds.join(", ")}`,
    "",
    msg.body,
  ].join("\n");
}

function formatThreadDetail(thread: ThreadDetail): string {
  const count = thread.messages.length;
  const header = `Thread: ${thread.id} (${count} ${count === 1 ? "message" : "messages"})`;
  const body = thread.messages.map(formatMessageDetail).join("\n\n---\n\n");
  return `${header}\n\n${body}`;
}

export function registerMessageTools(
  server: McpServer,
  gmail: GmailClient,
): void {
  server.tool(
    "gmail_search",
    "Search Gmail messages using Gmail query syntax (e.g. 'from:user@example.com', 'is:unread', 'subject:hello')",
    {
      query: z.string().describe("Gmail search query"),
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Max results (1-50)"),
    },
    async ({ query, maxResults }) => {
      try {
        const messages = await gmail.searchMessages(query, maxResults);
        if (messages.length === 0) {
          return { content: [{ type: "text", text: "No messages found." }] };
        }
        const text = messages.map(formatMessageSummary).join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return wrapGmailError(err, "Message");
      }
    },
  );

  server.tool(
    "gmail_get_message",
    "Get the full content of a Gmail message by ID",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        const msg = await gmail.getMessage(messageId, "full");
        return { content: [{ type: "text", text: formatMessageDetail(msg) }] };
      } catch (err) {
        return wrapGmailError(err, "Message");
      }
    },
  );

  server.tool(
    "gmail_get_thread",
    "Get all messages in a Gmail thread by thread ID",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        const thread = await gmail.getThread(threadId);
        return {
          content: [{ type: "text", text: formatThreadDetail(thread) }],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );

  server.tool(
    "gmail_archive",
    "Archive a message (remove from inbox)",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        await gmail.modifyMessage(messageId, [], ["INBOX"]);
        return {
          content: [{ type: "text", text: `Message ${messageId} archived.` }],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_batch_archive",
    "Archive multiple messages",
    {
      messageIds: z
        .array(z.string())
        .min(1)
        .describe("List of Gmail message IDs"),
    },
    async ({ messageIds }) => {
      try {
        await gmail.batchModifyMessages(messageIds, [], ["INBOX"]);
        return {
          content: [
            { type: "text", text: `${messageIds.length} messages archived.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_trash",
    "Move a message to trash",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        await gmail.trashMessage(messageId);
        return {
          content: [{ type: "text", text: `Message ${messageId} trashed.` }],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_batch_trash",
    "Move multiple messages to trash",
    {
      messageIds: z
        .array(z.string())
        .min(1)
        .describe("List of Gmail message IDs"),
    },
    async ({ messageIds }) => {
      try {
        // Gmail has no batch equivalent of messages.trash, but TRASH is an
        // ordinary system label that batchModify can apply.
        await gmail.batchModifyMessages(messageIds, ["TRASH"], []);
        return {
          content: [
            { type: "text", text: `${messageIds.length} messages trashed.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_untrash",
    "Remove a message from trash",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        await gmail.untrashMessage(messageId);
        return {
          content: [
            { type: "text", text: `Message ${messageId} removed from trash.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_mark_read",
    "Mark a message as read",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        await gmail.modifyMessage(messageId, [], ["UNREAD"]);
        return {
          content: [
            { type: "text", text: `Message ${messageId} marked as read.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_mark_unread",
    "Mark a message as unread",
    {
      messageId: z.string().describe("Gmail message ID"),
    },
    async ({ messageId }) => {
      try {
        await gmail.modifyMessage(messageId, ["UNREAD"], []);
        return {
          content: [
            { type: "text", text: `Message ${messageId} marked as unread.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );
}

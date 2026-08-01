import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GmailClient } from "../gmail-client.js";
import { wrapGmailError } from "./error-handler.js";

export function registerThreadTools(
  server: McpServer,
  gmail: GmailClient,
): void {
  server.tool(
    "gmail_archive_thread",
    "Archive all messages in a thread (remove from inbox)",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        await gmail.modifyThread(threadId, [], ["INBOX"]);
        return {
          content: [{ type: "text", text: `Thread ${threadId} archived.` }],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );

  server.tool(
    "gmail_trash_thread",
    "Move all messages in a thread to trash",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        await gmail.trashThread(threadId);
        return {
          content: [{ type: "text", text: `Thread ${threadId} trashed.` }],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );

  server.tool(
    "gmail_untrash_thread",
    "Remove a thread from trash",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        await gmail.untrashThread(threadId);
        return {
          content: [
            { type: "text", text: `Thread ${threadId} removed from trash.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );

  server.tool(
    "gmail_mark_thread_read",
    "Mark all messages in a thread as read",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        await gmail.modifyThread(threadId, [], ["UNREAD"]);
        return {
          content: [
            { type: "text", text: `Thread ${threadId} marked as read.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );

  server.tool(
    "gmail_mark_thread_unread",
    "Mark all messages in a thread as unread",
    {
      threadId: z.string().describe("Gmail thread ID"),
    },
    async ({ threadId }) => {
      try {
        await gmail.modifyThread(threadId, ["UNREAD"], []);
        return {
          content: [
            { type: "text", text: `Thread ${threadId} marked as unread.` },
          ],
        };
      } catch (err) {
        return wrapGmailError(err, "Thread");
      }
    },
  );
}

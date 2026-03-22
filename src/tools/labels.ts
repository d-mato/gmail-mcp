import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GmailClient } from "../gmail-client.js";
import { wrapGmailError } from "./error-handler.js";

export function registerLabelTools(
  server: McpServer,
  gmail: GmailClient,
): void {
  server.tool("gmail_list_labels", "List all Gmail labels", {}, async () => {
    try {
      const labels = await gmail.listLabels();
      const text = labels
        .map((l) => `${l.id}: ${l.name} (type: ${l.type ?? "user"})`)
        .join("\n");
      return { content: [{ type: "text", text: text || "No labels found." }] };
    } catch (err) {
      return wrapGmailError(err, "Label");
    }
  });

  server.tool(
    "gmail_add_label",
    "Add a label to a message",
    {
      messageId: z.string().describe("Gmail message ID"),
      labelId: z.string().describe("Label ID to add"),
    },
    async ({ messageId, labelId }) => {
      try {
        await gmail.modifyMessage(messageId, [labelId], []);
        return {
          content: [
            {
              type: "text",
              text: `Label ${labelId} added to message ${messageId}.`,
            },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_remove_label",
    "Remove a label from a message",
    {
      messageId: z.string().describe("Gmail message ID"),
      labelId: z.string().describe("Label ID to remove"),
    },
    async ({ messageId, labelId }) => {
      try {
        await gmail.modifyMessage(messageId, [], [labelId]);
        return {
          content: [
            {
              type: "text",
              text: `Label ${labelId} removed from message ${messageId}.`,
            },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_create_label",
    "Create a new Gmail label",
    {
      name: z.string().describe("Label name"),
    },
    async ({ name }) => {
      try {
        const label = await gmail.createLabel(name);
        return {
          content: [
            {
              type: "text",
              text: `Label created: ${label.id} (${label.name})`,
            },
          ],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );

  server.tool(
    "gmail_delete_label",
    "Delete a Gmail label",
    {
      labelId: z.string().describe("Label ID to delete"),
    },
    async ({ labelId }) => {
      try {
        await gmail.deleteLabel(labelId);
        return {
          content: [{ type: "text", text: `Label ${labelId} deleted.` }],
        };
      } catch (err) {
        return wrapGmailError(err);
      }
    },
  );
}

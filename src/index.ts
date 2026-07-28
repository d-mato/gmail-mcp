#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticate } from "./auth.js";
import { GmailClient } from "./gmail-client.js";
import {
  registerLabelTools,
  registerMessageTools,
  registerThreadTools,
} from "./tools/index.js";

async function main() {
  const auth = await authenticate();
  const gmailClient = new GmailClient(auth);

  const server = new McpServer({
    name: "gmail-mcp",
    version: "0.1.0",
  });

  registerMessageTools(server, gmailClient);
  registerThreadTools(server, gmailClient);
  registerLabelTools(server, gmailClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gmail MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

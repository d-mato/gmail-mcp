import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".gmail-mcp");
export const TOKENS_PATH =
  process.env.GMAIL_MCP_TOKENS_PATH ?? join(CONFIG_DIR, "tokens.json");
export const OAUTH_PORT = Number(process.env.GMAIL_MCP_OAUTH_PORT ?? "3000");

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

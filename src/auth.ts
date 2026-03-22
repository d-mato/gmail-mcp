import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";
import open from "open";
import { CONFIG_DIR, GMAIL_SCOPES, OAUTH_PORT, TOKENS_PATH } from "./types.js";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// Bundled OAuth client credentials for gmail-mcp.
// Users can override by setting GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET.
const DEFAULT_CLIENT_ID =
  "467574130802-k6hgca5a04vgm05t37vfcqp3ok1bod4l.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET = "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";

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GMAIL_MCP_CLIENT_ID ?? DEFAULT_CLIENT_ID;
  const clientSecret =
    process.env.GMAIL_MCP_CLIENT_SECRET ?? DEFAULT_CLIENT_SECRET;

  return { clientId, clientSecret };
}

async function loadTokens(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(TOKENS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTokens(tokens: Record<string, unknown>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

function authorizeViaLocalServer(oauth2Client: OAuth2Client): Promise<void> {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
    });

    const server = createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400);
          res.end("Bad request");
          return;
        }
        const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400);
          res.end(`Authorization denied: ${error}`);
          reject(new Error(`OAuth authorization denied: ${error}`));
          server.close();
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("Missing authorization code");
          reject(new Error("Missing authorization code"));
          server.close();
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        await saveTokens(tokens as Record<string, unknown>);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authorization successful!</h1>" +
            "<p>You can close this window and return to your terminal.</p></body></html>",
        );

        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500);
        res.end("Authorization failed");
        reject(err);
        server.close();
      }
    });

    server.listen(OAUTH_PORT, () => {
      console.error("Opening browser for Gmail authorization...");
      open(authUrl).catch(() => {
        console.error(`Please open this URL manually:\n${authUrl}`);
      });
    });

    server.on("error", (err) => {
      reject(
        new Error(
          `Failed to start OAuth server on port ${OAUTH_PORT}: ${err.message}`,
        ),
      );
    });
  });
}

export async function authenticate(): Promise<OAuth2Client> {
  const { clientId, clientSecret } = getCredentials();

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `http://localhost:${OAUTH_PORT}/oauth2callback`,
  );

  // Try loading existing tokens
  const tokens = await loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

    // Listen for token refresh events to persist new tokens
    oauth2Client.on("tokens", (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      saveTokens(merged).catch((err) =>
        console.error("Failed to save refreshed tokens:", err),
      );
    });

    console.error("Gmail MCP: Using stored credentials");
    return oauth2Client;
  }

  // No tokens — run OAuth flow
  await authorizeViaLocalServer(oauth2Client);

  oauth2Client.on("tokens", (newTokens) => {
    saveTokens(newTokens as Record<string, unknown>).catch((err) =>
      console.error("Failed to save refreshed tokens:", err),
    );
  });

  console.error("Gmail MCP: Authorization complete");
  return oauth2Client;
}

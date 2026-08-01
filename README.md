# gmail-mcp

[![npm version](https://img.shields.io/npm/v/@d-mato/gmail-mcp.svg)](https://www.npmjs.com/package/@d-mato/gmail-mcp)

MCP server for Gmail — search, read, archive, and manage your email from any MCP client.

## Setup

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@d-mato/gmail-mcp"]
    }
  }
}
```

On first launch, a browser window will open for Google account authorization. After granting access, the token is stored locally at `~/.gmail-mcp/tokens.json` and you won't need to authorize again.

## Available Tools

### Messages

| Tool | Description |
|------|-------------|
| `gmail_search` | Search messages using Gmail query syntax (e.g. `from:user@example.com`, `is:unread`); paginate with `pageToken` |
| `gmail_get_message` | Get the full content of a message by ID |
| `gmail_get_thread` | Get all messages in a thread by thread ID |
| `gmail_archive` | Archive a message (remove from inbox) |
| `gmail_batch_archive` | Archive multiple messages |
| `gmail_trash` | Move a message to trash |
| `gmail_batch_trash` | Move multiple messages to trash |
| `gmail_untrash` | Remove a message from trash |
| `gmail_mark_read` | Mark a message as read |
| `gmail_mark_unread` | Mark a message as unread |

### Labels

| Tool | Description |
|------|-------------|
| `gmail_list_labels` | List all labels |
| `gmail_add_label` | Add a label to a message |
| `gmail_remove_label` | Remove a label from a message |
| `gmail_create_label` | Create a new label |
| `gmail_delete_label` | Delete a label |

## License

MIT

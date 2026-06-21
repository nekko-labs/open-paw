# Open Paw CLI + MCP server (`opaw`)

Drive your local Open Paw agent from the terminal — or expose it to other tools
(Claude Code, Codex, any MCP client) so they can trigger agents, make chat
requests, spin up sessions, and read status. Runs the same engine (`createHost`)
in-process against your data dir.

```bash
npm run build -w @open-paw/cli
node apps/cli/dist/index.js status        # or: npm link, then `opaw status`
```

By default it uses `~/.open-paw` (shared with the web/Docker edition). Point
`OPENPAW_DATA_DIR` at the desktop app's dir to share that state instead
(`%APPDATA%/Open Paw/open-paw` on Windows, `~/Library/Application Support/Open Paw/open-paw` on macOS).

## CLI

```bash
opaw status                          # providers, model, workspaces, sessions, relay
opaw sessions                        # list chats
opaw chat "summarize README.md" \    # run an agent turn (streams the reply)
  --workspace <id> --new
opaw chat "and now add tests" --session <id>
```

`chat` auto-approves tool calls (it's your machine, invoked explicitly).

## MCP server

```bash
opaw mcp        # JSON-RPC 2.0 over stdio
```

Register it in **Claude Code**:

```bash
claude mcp add open-paw -- node /abs/path/open-paw/apps/cli/dist/index.js mcp
# (or once published/linked: claude mcp add open-paw -- opaw mcp)
```

Or in any MCP client config:

```json
{ "mcpServers": { "open-paw": { "command": "opaw", "args": ["mcp"] } } }
```

### Tools exposed

| Tool | What |
| --- | --- |
| `open_paw_chat` | Run an agent turn (reads/edits/runs in your workspace); returns the reply. Omit `sessionId` to start fresh. |
| `open_paw_list_sessions` | List sessions. |
| `open_paw_new_session` | Create a session, returns its id. |
| `open_paw_get_session` | Get a transcript. |
| `open_paw_status` | Providers, default model, workspaces, session count, relay status. |

**Swarms**: call `open_paw_new_session` a few times and fan out `open_paw_chat`
across the session ids — each is an independent agent driving your local model.

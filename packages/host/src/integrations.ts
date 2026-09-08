import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { AgentToolId, AgentToolStatus, SubagentInstallResult, SubagentSnippet } from '@kotrain/shared';
import { backupFile, writeJsonAtomic, writeTextAtomic } from './secure-file.js';

/**
 * Installing Agent Nekko as an MCP subagent inside other agent CLIs. Each tool
 * is detected by its user-level config directory; install merges an
 * `agent-nekko` entry (`npx -y kotrain mcp`, the portable invocation) into the
 * tool's MCP config file. The existing file is copied to `<file>.bak` before
 * any write, and writes go through the atomic temp+rename helpers so a crash
 * can't leave a half-written config.
 *
 * A `home` parameter is accepted by every function so tests (and unusual
 * setups) can point at a scratch HOME instead of the real one.
 */

/** The server key written into every tool's MCP config. */
const SERVER_NAME = 'agent-nekko';
/** Older installs registered under this key; they count as installed. */
const LEGACY_SERVER_NAMES = ['kotrain'];
/** The portable command every tool gets: the bundled CLI over stdio. */
const MCP_ENTRY = { command: 'npx', args: ['-y', 'kotrain', 'mcp'] };

interface AgentToolSpec {
  id: AgentToolId;
  label: string;
  /** User-level config dirs; any of them existing means the tool is present. */
  detectDirs: string[];
  /** The MCP config file, relative to home. */
  configFile: string;
  format: 'json' | 'toml';
  /** Human-readable target for the manual snippet, e.g. "~/.claude.json → mcpServers". */
  snippetTarget: string;
}

const TOOLS: AgentToolSpec[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    detectDirs: ['.claude'],
    configFile: '.claude.json',
    format: 'json',
    snippetTarget: '~/.claude.json → "mcpServers"',
  },
  {
    id: 'codex',
    label: 'Codex',
    detectDirs: ['.codex'],
    configFile: join('.codex', 'config.toml'),
    format: 'toml',
    snippetTarget: '~/.codex/config.toml',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    detectDirs: ['.cursor'],
    configFile: join('.cursor', 'mcp.json'),
    format: 'json',
    snippetTarget: '~/.cursor/mcp.json → "mcpServers"',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    detectDirs: ['.windsurf', join('.codeium', 'windsurf')],
    configFile: join('.codeium', 'windsurf', 'mcp_config.json'),
    format: 'json',
    snippetTarget: '~/.codeium/windsurf/mcp_config.json → "mcpServers"',
  },
];

/** The TOML block appended to Codex's config.toml. */
const TOML_SECTION = `[mcp_servers.${SERVER_NAME}]\ncommand = "npx"\nargs = ["-y", "kotrain", "mcp"]\n`;

/** Matches an existing `[mcp_servers.agent-nekko]`/`[mcp_servers.kotrain]` table header, bare or quoted. */
const TOML_ENTRY_RE = new RegExp(
  `^\\s*\\[\\s*mcp_servers\\s*\\.\\s*"?(?:${[SERVER_NAME, ...LEGACY_SERVER_NAMES].join('|')})"?\\s*\\]\\s*$`,
  'm',
);

function specFor(tool: AgentToolId): AgentToolSpec | undefined {
  return TOOLS.find((t) => t.id === tool);
}

/** Read the tool's config file if present; `undefined` when it doesn't exist. */
function readConfig(spec: AgentToolSpec, home: string): string | undefined {
  const path = join(home, spec.configFile);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function isInstalled(spec: AgentToolSpec, home: string): boolean {
  const text = readConfig(spec, home);
  if (!text) return false;
  if (spec.format === 'toml') return TOML_ENTRY_RE.test(text);
  try {
    const cfg = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
    const servers = cfg?.mcpServers ?? {};
    return Boolean(servers[SERVER_NAME] || LEGACY_SERVER_NAMES.some((n) => servers[n]));
  } catch {
    return false; // unparseable config isn't "installed"; install reports it
  }
}

/** Which agent CLIs have a config dir, and whether Nekko is already wired in. */
export function detectAgentTools(home: string = homedir()): AgentToolStatus[] {
  return TOOLS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    configPath: join(home, spec.configFile),
    detected: spec.detectDirs.some((d) => existsSync(join(home, d))),
    installed: isInstalled(spec, home),
  }));
}

/**
 * Merge the agent-nekko MCP entry into a tool's config. Idempotent: an existing
 * entry is reported as already installed rather than duplicated. Returns the
 * refreshed tool list either way so callers can re-render from one response.
 */
export function installSubagent(tool: AgentToolId, home: string = homedir()): SubagentInstallResult {
  const spec = specFor(tool);
  if (!spec) return { ok: false, message: 'Unknown tool.', tools: detectAgentTools(home) };

  const detected = spec.detectDirs.some((d) => existsSync(join(home, d)));
  if (!detected) {
    return {
      ok: false,
      message: `${spec.label} wasn't found on this machine. Install it first, or use the manual config.`,
      tools: detectAgentTools(home),
    };
  }
  if (isInstalled(spec, home)) {
    return { ok: true, message: `Already installed in ${spec.label}.`, tools: detectAgentTools(home) };
  }

  const path = join(home, spec.configFile);
  if (spec.format === 'json') {
    let cfg: Record<string, unknown> = {};
    const text = readConfig(spec, home);
    if (text !== undefined) {
      try {
        const parsed = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) cfg = parsed;
      } catch {
        // Never clobber a config we can't parse; the backup isn't even written
        // so the file is exactly as the tool left it.
        return {
          ok: false,
          message: `${spec.configFile} isn't valid JSON. Fix it by hand or add the entry manually.`,
          tools: detectAgentTools(home),
        };
      }
    }
    const servers = (cfg.mcpServers ?? {}) as Record<string, unknown>;
    cfg.mcpServers = { ...servers, [SERVER_NAME]: { ...MCP_ENTRY } };
    backupFile(path);
    mkdirSync(dirname(path), { recursive: true });
    writeJsonAtomic(path, cfg);
  } else {
    const text = readConfig(spec, home);
    const body = (text ?? '').replace(/\s+$/, '');
    const next = body ? `${body}\n\n${TOML_SECTION}` : TOML_SECTION;
    backupFile(path);
    mkdirSync(dirname(path), { recursive: true });
    writeTextAtomic(path, next);
  }
  return { ok: true, tools: detectAgentTools(home) };
}

/** The manual copy-paste fallback: where the snippet goes and what to paste. */
export function subagentSnippet(tool: AgentToolId): SubagentSnippet {
  const spec = specFor(tool);
  if (!spec) return { target: '', snippet: '' };
  if (spec.format === 'toml') {
    return { target: spec.snippetTarget, snippet: TOML_SECTION.trimEnd() };
  }
  return {
    target: spec.snippetTarget,
    snippet: `"mcpServers": {\n  "${SERVER_NAME}": {\n    "command": "npx",\n    "args": ["-y", "kotrain", "mcp"]\n  }\n}`,
  };
}

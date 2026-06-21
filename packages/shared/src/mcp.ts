/** Model Context Protocol (MCP) client contracts. */

/** A configured MCP server (stdio transport). */
export interface McpServerConfig {
  id: string;
  name: string;
  /** Executable to spawn, e.g. "npx". */
  command: string;
  /** Arguments, e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/path"]. */
  args: string[];
  enabled: boolean;
}

/** A tool exposed by an MCP server. */
export interface McpToolInfo {
  name: string;
  description?: string;
}

/** Live connection status for an MCP server. */
export interface McpServerStatus {
  id: string;
  name: string;
  connected: boolean;
  tools: McpToolInfo[];
  error?: string;
}

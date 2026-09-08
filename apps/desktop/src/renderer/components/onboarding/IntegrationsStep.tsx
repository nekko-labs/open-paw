import React from 'react';

/**
 * Placeholder for the integrations step (lands in a follow-up PR: using Agent
 * Nekko as a subagent inside Claude Code / Codex / Cursor, plus app
 * connectors like Slack and Linear). The card points at where those live today.
 */
export function IntegrationsStep() {
  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Meet your tools</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14px] leading-relaxed text-ink-soft">
        Agent Nekko can run as a subagent inside other agent CLIs and plug into the apps you already
        use, like GitHub, Slack, and Linear.
      </p>
      <div className="card mt-6 p-5">
        <h2 className="font-semibold">Guided setup is on its way</h2>
        <p className="mt-1 text-[13px] text-ink-faint">
          One-click installs land here in the next update. Until then, the Connectors tab links your
          apps, and <code className="text-[12px]">kotrain mcp</code> exposes Agent Nekko as an MCP
          server other agents can call.
        </p>
      </div>
    </div>
  );
}

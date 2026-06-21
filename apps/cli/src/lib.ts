import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHost, type Host } from '@open-paw/host';
import type { AgentEvent } from '@open-paw/shared';

/** The data dir to operate on — shares config/sessions with the web/Docker
 *  edition by default; point OPENPAW_DATA_DIR at the desktop app's dir to share
 *  that instead (`%APPDATA%/Open Paw/open-paw` on Windows). */
export function dataDir(): string {
  return process.env.OPENPAW_DATA_DIR || join(homedir(), '.open-paw');
}

let host: Host | null = null;
export function getHost(): Host {
  if (!host) host = createHost({ dataDir: dataDir() });
  return host;
}

/** Resolve provider + model from flags or the saved defaults. Throws if none. */
export function resolveModel(
  h: Host,
  opts: { provider?: string; model?: string; sessionProvider?: string; sessionModel?: string },
): { providerId: string; modelId: string } {
  const s = h.getSettings();
  const providerId = opts.provider || opts.sessionProvider || s.defaultProviderId || s.providers[0]?.id;
  const modelId = opts.model || opts.sessionModel || s.defaultModelId;
  if (!providerId) throw new Error('No provider configured. Add one in the app, or pass --provider.');
  if (!modelId) throw new Error('No model selected. Pass --model, or set a default in the app.');
  return { providerId, modelId };
}

/**
 * Run one chat turn to completion on an existing session, auto-approving tool
 * calls (this is the user's own machine, invoked explicitly). Streams text via
 * onText and resolves with the full assistant message.
 */
export function runChat(
  h: Host,
  args: { sessionId: string; providerId: string; modelId: string; text: string; onText?: (s: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const handler = (e: AgentEvent) => {
      if (e.sessionId !== args.sessionId) return;
      switch (e.type) {
        case 'text':
          out += e.delta;
          args.onText?.(e.delta);
          break;
        case 'tool_approval_required':
          h.approveTool(e.sessionId, e.call.id, true); // auto-approve in the CLI
          break;
        case 'done':
          h.events.off('agentEvent', handler);
          resolve(out);
          break;
        case 'error':
          h.events.off('agentEvent', handler);
          reject(new Error(e.message));
          break;
      }
    };
    h.events.on('agentEvent', handler);
    h.sendChat({ sessionId: args.sessionId, providerId: args.providerId, modelId: args.modelId, text: args.text }).catch(
      (err) => {
        h.events.off('agentEvent', handler);
        reject(err);
      },
    );
  });
}

import { estimateTokens } from '@open-paw/shared';
import type { ContextBundle, ContextItem, MemoryEntry } from '@open-paw/shared';

/** Inputs the assembler uses to build the context bundle for a turn. */
export interface AssembleInput {
  /** Files explicitly attached by the user (path → content). */
  attached: Array<{ path: string; content: string }>;
  /** Guideline files discovered in the workspace (AGENTS.md / CLAUDE.md / .cursorrules). */
  guidelines: Array<{ path: string; content: string }>;
  /** Relevant memory entries. */
  memory: MemoryEntry[];
  /** Connector-derived snippets. */
  connectorSnippets: Array<{ label: string; origin: string; body: string }>;
  /** Index search snippets relevant to the query. */
  indexSnippets: Array<{ relPath: string; path: string; body: string }>;
  contextWindow?: number;
  /** Item ids the user toggled off. */
  excluded?: Set<string>;
  /** Item ids the user pinned. */
  pinned?: Set<string>;
}

const GUIDELINE_NAMES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', 'GEMINI.md'];

export function isGuidelineFile(name: string): boolean {
  return GUIDELINE_NAMES.includes(name);
}

function preview(text: string, n = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + '…' : flat;
}

/**
 * Build a ContextBundle with one provenance record per included item. This is
 * the single source of truth behind the Context Inspector — nothing enters the
 * prompt that isn't represented here.
 */
export function assembleContext(input: AssembleInput): ContextBundle {
  const excluded = input.excluded ?? new Set<string>();
  const pinned = input.pinned ?? new Set<string>();
  const items: ContextItem[] = [];

  const push = (
    source: ContextItem['source'],
    id: string,
    label: string,
    origin: string,
    content: string,
  ) => {
    const included = !excluded.has(id);
    items.push({
      id,
      source,
      label,
      origin,
      tokens: estimateTokens(content),
      pinned: pinned.has(id),
      included,
      preview: preview(content),
    });
  };

  for (const g of input.guidelines) push('guideline', `guideline:${g.path}`, basename(g.path), g.path, g.content);
  for (const a of input.attached) push('attached-file', `file:${a.path}`, basename(a.path), a.path, a.content);
  for (const m of input.memory) push('memory', `mem:${m.id}`, m.title, `memory/${m.scope}`, m.body);
  for (const c of input.connectorSnippets) push('connector', `conn:${c.origin}`, c.label, c.origin, c.body);
  for (const s of input.indexSnippets) push('index-snippet', `idx:${s.path}`, s.relPath, s.path, s.body);

  const totalTokens = items.filter((i) => i.included).reduce((sum, i) => sum + i.tokens, 0);
  return { items, totalTokens, contextWindow: input.contextWindow };
}

/** Render the included items into a system-prompt context block. */
export function renderContextBlock(bundle: ContextBundle, contents: Map<string, string>): string {
  const parts: string[] = [];
  for (const item of bundle.items) {
    if (!item.included) continue;
    const body = contents.get(item.id) ?? item.preview;
    const header =
      item.source === 'guideline'
        ? `# Guideline: ${item.label}`
        : item.source === 'memory'
          ? `# Memory: ${item.label}`
          : item.source === 'connector'
            ? `# ${item.label} (${item.origin})`
            : `# File: ${item.origin}`;
    parts.push(`${header}\n${body}`);
  }
  return parts.join('\n\n---\n\n');
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

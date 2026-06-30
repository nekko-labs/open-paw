import React, { useMemo, useState } from 'react';
import {
  SKILLS,
  SKILL_CATEGORIES,
  layoutWorkflow,
  type SkillDef,
  type SkillNodeKind,
  type LaidOutNode,
} from '@open-paw/shared';
import { useStore } from '../store.js';
import { StarIcon, SendIcon } from '../icons.js';

/** Per-node-kind visual identity for the workflow canvas. */
const KIND: Record<SkillNodeKind, { color: string; glyph: string; label: string }> = {
  trigger: { color: '#f59e0b', glyph: '⚡', label: 'Trigger' },
  context: { color: '#6f9bff', glyph: '▤', label: 'Context' },
  agent: { color: '#a78bfa', glyph: '✦', label: 'Agent' },
  tool: { color: '#4ec98a', glyph: '⚙', label: 'Tool' },
  decision: { color: '#fbbf24', glyph: '◆', label: 'Decision' },
  loop: { color: '#f472b6', glyph: '↻', label: 'Loop' },
  output: { color: '#34d399', glyph: '✓', label: 'Output' },
};

export function SkillsView() {
  const { sendToChat } = useStore();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(SKILLS[0]?.id ?? '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SKILLS;
    return SKILLS.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [query]);

  const selected = SKILLS.find((s) => s.id === selectedId) ?? filtered[0] ?? SKILLS[0];

  return (
    <div className="flex h-full min-h-0">
      {/* Skill list */}
      <aside className="flex w-72 flex-col border-r border-line">
        <div className="p-4">
          <h1 className="text-lg font-semibold text-gradient">Skills</h1>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            Ready-made agent workflows. Pick one to see how it runs, then use it in a chat.
          </p>
          <input
            className="input mt-3"
            placeholder="Search skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {SKILL_CATEGORIES.map((cat) => {
            const items = filtered.filter((s) => s.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="mb-3">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{cat}</p>
                <div className="space-y-1">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                        selected?.id === s.id ? 'border-accent' : 'border-transparent hover:bg-surface-2'
                      } border`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <div className="flex items-center gap-1.5">
                        {s.highlighted && <StarIcon className="h-3.5 w-3.5 text-accent" filled />}
                        <span className="font-mono text-[13px] font-medium">/{s.name}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-soft">{s.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-2 text-[12px] text-ink-faint">No skills match “{query}”.</p>}
        </div>
      </aside>

      {/* Detail + workflow canvas */}
      {selected && (
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {selected.highlighted && <StarIcon className="h-4 w-4 text-accent" filled />}
                <h2 className="truncate font-mono text-[16px] font-semibold">/{selected.name}</h2>
                <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>
                  {selected.category}
                </span>
                {selected.kind === 'goal' && (
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    background agent
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">{selected.description}</p>
              {selected.tools && selected.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-faint">Tools:</span>
                  {selected.tools.map((t) => (
                    <span key={t} className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn btn-primary shrink-0 gap-1.5"
              onClick={() => sendToChat(selected.template, false)}
              title="Drop this skill into a chat composer"
            >
              <SendIcon className="h-4 w-4" /> Use in chat
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <p className="text-[12px] font-medium text-ink-soft">Workflow</p>
              <Legend />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6" style={{ background: 'var(--paper)' }}>
              <WorkflowCanvas skill={selected} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Legend() {
  const kinds: SkillNodeKind[] = ['trigger', 'context', 'agent', 'tool', 'decision', 'loop', 'output'];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1 text-[10.5px] text-ink-faint">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: KIND[k].color }} />
          {KIND[k].label}
        </span>
      ))}
    </div>
  );
}

/** n8n / Make-style node-graph rendering of a skill's workflow. */
function WorkflowCanvas({ skill }: { skill: SkillDef }) {
  const layout = useMemo(() => layoutWorkflow(skill.workflow), [skill]);
  const { nodes, edges, width, height, nodeW, nodeH } = layout;
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div
      className="relative"
      style={{
        width,
        height,
        minWidth: width,
        // Subtle dotted grid like a node-editor canvas.
        backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <svg width={width} height={height} className="absolute inset-0" style={{ overflow: 'visible' }}>
        <defs>
          <marker id="op-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-faint)" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const { d, lx, ly } = edgePath(a, b, nodeW, nodeH, e.back);
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke="var(--ink-faint)"
                strokeWidth={1.5}
                strokeDasharray={e.back ? '4 4' : undefined}
                markerEnd="url(#op-arrow)"
                opacity={e.back ? 0.7 : 0.9}
              />
              {e.label && (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  className="select-none"
                  style={{ fontSize: 10, fill: 'var(--ink-soft)' }}
                >
                  <tspan dy="-2" style={{ paintOrder: 'stroke' as const }}>
                    {e.label}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((n) => (
        <NodeCard key={n.id} node={n} w={nodeW} h={nodeH} />
      ))}
    </div>
  );
}

function NodeCard({ node, w, h }: { node: LaidOutNode; w: number; h: number }) {
  const k = KIND[node.kind];
  return (
    <div
      className="card absolute flex flex-col justify-center overflow-hidden px-3 py-2 shadow-sm"
      style={{ left: node.x, top: node.y, width: w, height: h, borderLeft: `3px solid ${k.color}` }}
      title={node.detail}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: k.color }}>{k.glyph}</span>
        <span className="truncate text-[12.5px] font-medium leading-tight">{node.label}</span>
      </div>
      {node.detail && <p className="mt-0.5 truncate text-[10.5px] text-ink-faint">{node.detail}</p>}
    </div>
  );
}

/** Bezier path between two node boxes; forward edges go right, back edges loop under. */
function edgePath(a: LaidOutNode, b: LaidOutNode, w: number, h: number, back?: boolean) {
  if (back) {
    // Loop edge: leave the source's bottom, dip below, re-enter the target's bottom.
    const sx = a.x + w / 2;
    const sy = a.y + h;
    const tx = b.x + w / 2;
    const ty = b.y + h;
    const dip = Math.max(sy, ty) + 46;
    return {
      d: `M ${sx} ${sy} C ${sx} ${dip}, ${tx} ${dip}, ${tx} ${ty}`,
      lx: (sx + tx) / 2,
      ly: dip - 6,
    };
  }
  const sx = a.x + w;
  const sy = a.y + h / 2;
  const tx = b.x;
  const ty = b.y + h / 2;
  const dx = Math.max(28, (tx - sx) / 2);
  return {
    d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`,
    lx: (sx + tx) / 2,
    ly: (sy + ty) / 2 - 4,
  };
}

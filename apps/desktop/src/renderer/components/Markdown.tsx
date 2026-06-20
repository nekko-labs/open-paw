import React from 'react';

/**
 * Minimal, dependency-free markdown renderer covering the constructs chat
 * models actually emit: fenced code blocks, inline code, bold, headings, and
 * bullet lists. Kept intentionally small; not a full CommonMark implementation.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const parts = text.split(/```/);

  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf('\n');
      const lang = nl > 0 ? part.slice(0, nl).trim() : '';
      const code = nl > 0 ? part.slice(nl + 1) : part;
      blocks.push(
        <pre
          key={`code-${i}`}
          className="my-2 overflow-x-auto rounded-xl border border-line p-3 font-mono text-[12.5px] leading-relaxed"
          style={{ background: 'var(--surface-2)' }}
        >
          {lang && <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">{lang}</div>}
          <code>{code.replace(/\n$/, '')}</code>
        </pre>,
      );
    } else {
      part.split('\n\n').forEach((para, j) => {
        if (!para.trim()) return;
        blocks.push(<div key={`p-${i}-${j}`}>{renderParagraph(para)}</div>);
      });
    }
  });

  return <div className="space-y-1 text-[14px] leading-relaxed">{blocks}</div>;
}

function renderParagraph(para: string): React.ReactNode {
  const lines = para.split('\n');

  // Unordered list.
  const isBullet = lines.every((l) => /^\s*[-*]\s+/.test(l) || !l.trim());
  if (isBullet && lines.some((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul className="ml-4 list-disc space-y-0.5">
        {lines.filter((l) => l.trim()).map((l, k) => (
          <li key={k}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
        ))}
      </ul>
    );
  }

  // Ordered list.
  const isOrdered = lines.every((l) => /^\s*\d+\.\s+/.test(l) || !l.trim());
  if (isOrdered && lines.some((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol className="ml-5 list-decimal space-y-0.5">
        {lines.filter((l) => l.trim()).map((l, k) => (
          <li key={k}>{inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>
        ))}
      </ol>
    );
  }

  const heading = /^(#{1,4})\s+(.*)$/.exec(para);
  if (heading) {
    const level = heading[1].length;
    return <div className={`font-semibold ${level <= 2 ? 'text-[15px]' : ''}`}>{inline(heading[2])}</div>;
  }
  return <p>{inline(para)}</p>;
}

function inline(s: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  // bold | inline code | [text](url) link
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded px-1 py-0.5 font-mono text-[12.5px]" style={{ background: 'var(--surface-2)' }}>
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      // target=_blank routes through Electron's setWindowOpenHandler → opens externally.
      nodes.push(
        <a key={key++} href={m[5]} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

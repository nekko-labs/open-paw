import { describe, it, expect } from 'vitest';
import { createRunawayGuard } from './runaway.js';

/** Feed a string to a guard one small delta at a time, as a stream would. */
function feed(text: string, chunk = 16): boolean {
  const guard = createRunawayGuard();
  for (let i = 0; i < text.length; i += chunk) {
    if (guard.push(text.slice(i, i + chunk))) return true;
  }
  return false;
}

describe('createRunawayGuard', () => {
  it('catches the observed failure: one sentence repeated forever', () => {
    // The real case: 2534 repetitions of this line, 108k characters of reasoning.
    expect(feed('Let me start building this feature now.\n\n'.repeat(2534))).toBe(true);
  });

  it('trips early, not after tens of thousands of characters', () => {
    const line = 'Let me start building this feature now.\n\n';
    const guard = createRunawayGuard();
    let seen = 0;
    for (let i = 0; i < 2534; i++) {
      seen += line.length;
      if (guard.push(line)) break;
    }
    expect(guard.tripped).toBe(true);
    expect(seen).toBeLessThan(4_000);
  });

  it('catches a cycle with no line breaks', () => {
    expect(feed('the same clause repeated over and over again, '.repeat(400))).toBe(true);
  });

  it('leaves a long, varied answer alone', () => {
    let text = '';
    for (let i = 0; i < 600; i++) {
      text += `Step ${i}: inspect module ${i} and record what its exports look like, then move on.\n`;
    }
    expect(feed(text)).toBe(false);
  });

  it('leaves generated code alone', () => {
    let code = 'export const ROUTES = [\n';
    for (let i = 0; i < 500; i++) {
      code += `  { id: 'route-${i}', path: '/section/${i}', title: 'Section ${i}', order: ${i} },\n`;
    }
    code += '];\n';
    expect(feed(code)).toBe(false);
  });

  it('leaves a short repetitive passage alone', () => {
    // Under the minimum length, so a model that says the same thing twice while
    // thinking is not cut off.
    expect(feed('Checking.\n'.repeat(30))).toBe(false);
  });

  it('stays tripped once it has tripped', () => {
    const guard = createRunawayGuard();
    while (!guard.push('Let me start building this feature now.\n\n')) {
      /* feed until it trips */
    }
    expect(guard.push('anything else at all')).toBe(true);
    expect(guard.tripped).toBe(true);
  });
});

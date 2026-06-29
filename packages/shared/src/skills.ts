/**
 * Skills — runnable, named capabilities surfaced in the composer's `/` menu,
 * alongside the user's saved prompts. These mirror the standard skills any agent
 * (Claude Code and others) can run; selecting one drops its scaffold into the
 * composer ready to send. `goal` is special (see `kind: 'goal'`): it starts a
 * long-running background agent that works until a condition is met.
 */

export interface SkillDef {
  id: string;
  /** Invoked as `/name` in the composer. */
  name: string;
  description: string;
  /** Text dropped into the composer when the skill is picked. */
  template: string;
  /** Featured at the top of the `/` menu with an accent. */
  highlighted?: boolean;
  /** 'goal' routes to a background "work until done" task instead of a normal turn. */
  kind?: 'prompt' | 'goal';
}

/** Standard skills available in every chat. */
export const SKILLS: SkillDef[] = [
  {
    id: 'goal',
    name: 'goal',
    description: 'Keep an agent working autonomously until a goal/condition is met',
    template: '/goal ',
    highlighted: true,
    kind: 'goal',
  },
  { id: 'research', name: 'research', description: 'Deep, multi-source research with a cited report', template: 'Research the following thoroughly and produce a well-cited report:\n\n' },
  { id: 'plan', name: 'plan', description: 'Produce a step-by-step implementation plan before coding', template: 'Create a detailed, step-by-step implementation plan for:\n\n' },
  { id: 'review', name: 'review', description: 'Review the current code/diff for bugs and improvements', template: 'Review the current changes for correctness bugs, edge cases, and possible improvements.' },
  { id: 'security-review', name: 'security-review', description: 'Audit the changes for security vulnerabilities', template: 'Do a focused security review of the current changes: look for injection, auth, secret-handling, and unsafe-input issues.' },
  { id: 'simplify', name: 'simplify', description: 'Simplify and de-duplicate the changed code', template: 'Review the changed code for reuse, simplification, and clarity, then apply the cleanups (no behavior change).' },
  { id: 'test', name: 'test', description: 'Write tests covering the important edge cases', template: 'Write tests for this code, covering the important edge cases.' },
  { id: 'explain', name: 'explain', description: 'Explain how this code works, step by step', template: 'Explain how this code works, step by step.' },
  { id: 'fix', name: 'fix', description: 'Find and fix the bug, explaining the root cause', template: 'Find and fix the bug. Explain the root cause and the fix.' },
  { id: 'commit', name: 'commit', description: 'Stage and commit the current changes with a good message', template: 'Stage and commit the current changes with a clear, conventional commit message.' },
  { id: 'pr', name: 'pr', description: 'Open a pull request for the current branch', template: 'Push the current branch and open a pull request with a short, plain description of the changes.' },
];

/** Match skills by a `/`-query (name substring), highlighted ones first. */
export function matchSkills(query: string): SkillDef[] {
  const q = query.toLowerCase();
  return SKILLS.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.highlighted) - Number(!!a.highlighted));
}

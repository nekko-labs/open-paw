import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Session } from '@nekko/shared';
import { dataDir } from './store.js';

function sessionsDir(): string {
  const dir = join(dataDir(), 'sessions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const pathFor = (id: string) => join(sessionsDir(), `${id}.json`);

export function listSessions(): Session[] {
  return readdirSync(sessionsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(sessionsDir(), f), 'utf8')) as Session;
      } catch {
        return null;
      }
    })
    .filter((s): s is Session => !!s)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  if (!existsSync(pathFor(id))) return null;
  try {
    return JSON.parse(readFileSync(pathFor(id), 'utf8')) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  s.updatedAt = Date.now();
  writeFileSync(pathFor(s.id), JSON.stringify(s, null, 2), 'utf8');
}

export function deleteSession(id: string): void {
  if (existsSync(pathFor(id))) rmSync(pathFor(id));
}

export function setSessionWorkspace(id: string, workspaceId?: string): Session | null {
  const s = getSession(id);
  if (!s) return null;
  s.workspaceId = workspaceId;
  saveSession(s);
  return s;
}

export function createSession(workspaceId?: string): Session {
  const now = Date.now();
  const s: Session = {
    id: `s_${now.toString(36)}`,
    title: 'New chat',
    workspaceId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  saveSession(s);
  return s;
}

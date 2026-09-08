import { chmodSync, copyFileSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function writeJsonAtomic(path: string, value: unknown): void {
  writeTextAtomic(path, JSON.stringify(value, null, 2));
}

export function writeTextAtomic(path: string, content: string): void {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
  chmodSync(path, 0o600);
}

/** Copy `path` to `<path>.bak` before an in-place merge; no-op if absent. */
export function backupFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const backup = `${path}.bak`;
  copyFileSync(path, backup);
  return backup;
}

export function ensurePrivateFile(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Permissions are best-effort on Windows and unusual filesystems. */
  }
}

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AppSettings } from '@nekko/shared';
import { DEFAULT_GUARDRAILS } from '@nekko/core';

export function dataDir(): string {
  const dir = join(app.getPath('userData'), 'nekko');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const SETTINGS_PATH = () => join(dataDir(), 'settings.json');

function defaults(): AppSettings {
  return {
    theme: 'system',
    accent: '#ff7a59',
    sandboxMode: 'workspace-jail',
    providers: [],
    guardrails: DEFAULT_GUARDRAILS,
    workspaces: [],
    connectors: [],
    mascotEnabled: true,
  };
}

let cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cache) return cache;
  try {
    if (existsSync(SETTINGS_PATH())) {
      const parsed = JSON.parse(readFileSync(SETTINGS_PATH(), 'utf8'));
      cache = { ...defaults(), ...parsed };
      // Ensure guardrails exist even if an old settings file lacked them.
      if (!cache!.guardrails?.length) cache!.guardrails = DEFAULT_GUARDRAILS;
      return cache!;
    }
  } catch {
    /* fall through to defaults */
  }
  cache = defaults();
  return cache;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  cache = { ...getSettings(), ...patch };
  writeFileSync(SETTINGS_PATH(), JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

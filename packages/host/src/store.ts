import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AppSettings } from '@open-paw/shared';
import { DEFAULT_PROMPTS, DEFAULT_SPEC_METHODOLOGY } from '@open-paw/shared';
import { DEFAULT_GUARDRAILS } from '@open-paw/core';
import { dataDir } from './paths.js';

export { dataDir } from './paths.js';

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
    prompts: DEFAULT_PROMPTS,
    specMethodology: DEFAULT_SPEC_METHODOLOGY,
  };
}

// Keyed by data dir so a single process serving many accounts (Nekko Cloud)
// never bleeds one account's settings into another. Single-data-dir editions
// (desktop/server/CLI) just use the one entry.
const cache = new Map<string, AppSettings>();

export function getSettings(): AppSettings {
  const dir = dataDir();
  const cached = cache.get(dir);
  if (cached) return cached;
  let settings: AppSettings;
  try {
    if (existsSync(SETTINGS_PATH())) {
      const parsed = JSON.parse(readFileSync(SETTINGS_PATH(), 'utf8'));
      settings = { ...defaults(), ...parsed };
      // Ensure guardrails exist even if an old settings file lacked them.
      if (!settings.guardrails?.length) settings.guardrails = DEFAULT_GUARDRAILS;
    } else {
      settings = defaults();
    }
  } catch {
    settings = defaults();
  }
  cache.set(dir, settings);
  return settings;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  cache.set(dataDir(), next);
  writeFileSync(SETTINGS_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Reset all settings (theme, providers, guardrails, prompts, …) to defaults. */
export function resetSettings(): AppSettings {
  const next = defaults();
  cache.set(dataDir(), next);
  writeFileSync(SETTINGS_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

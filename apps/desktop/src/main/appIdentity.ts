import type { App } from 'electron';
import { mkdirSync } from 'fs';
import { join } from 'path';

export function preservePackagedProfile(app: Pick<App, 'isPackaged' | 'getPath' | 'setPath'>): void {
  if (!app.isPackaged) return;
  const profile = join(app.getPath('appData'), 'Kotrain');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
}

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { createHost } from '@open-paw/host';
import { registerIpc } from './ipc.js';
import { loadWindowBounds, saveWindowBounds } from './windowState.js';

function createWindow(): void {
  const bounds = loadWindowBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f0f11',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Persist size/position (debounced) so the window reopens where it was.
  let saveTimer: NodeJS.Timeout | undefined;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return;
      const b = win.getBounds();
      saveWindowBounds(b);
    }, 400);
  };
  win.on('resize', persist);
  win.on('move', persist);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const host = createHost({ dataDir: join(app.getPath('userData'), 'open-paw') });
  registerIpc(host);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

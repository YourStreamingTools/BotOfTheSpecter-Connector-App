import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import iconPath from '../../resources/icon.png?asset';

// Re-exported so the main entrypoint can hand the same path to app.dock.setIcon()
// on macOS without depending on the asset import directly.
export const APP_ICON_PATH = iconPath;

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0D0D0D',
    show: false,
    // Sets the Windows + Linux taskbar entry icon and the OS window icon.
    // On macOS the dock icon is set separately at app start (see main/index.ts).
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

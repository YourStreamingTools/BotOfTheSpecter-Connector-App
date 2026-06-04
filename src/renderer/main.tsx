import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/tokens.css';
import './styles/electron.css';
import { App } from './App';
import { AccountProvider } from './state/account';
import { ObsProvider } from './state/useObs';
import { ThemeProvider, resolveTheme } from './state/theme';
import { ErrorBoundary } from './shell/ErrorBoundary';

// Last-resort visible fallback if React can't mount (preload missing, config IPC not ready, or a synchronous render throw), avoiding a permanently blank window.
function renderFatal(message: string): void {
  const el = document.getElementById('root');
  if (!el) return;
  el.textContent = '';
  const box = document.createElement('div');
  box.style.cssText = 'padding:24px;font-family:system-ui,sans-serif;color:#e6e6e6;line-height:1.5;';
  box.textContent = `BotOfTheSpecter failed to start: ${message}. Please restart the app.`;
  el.appendChild(box);
}

async function boot() {
  if (!window.api) throw new Error('preload bridge unavailable');
  const cfg = await window.api.config.all();
  const themePref = cfg.theme ?? 'dark';
  const root = document.documentElement;
  // Apply before React mounts so there's no flash of the wrong theme.
  root.setAttribute('data-theme', resolveTheme(themePref));
  root.setAttribute('data-density', cfg.density ?? 'regular');
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {/* Top-level backstop: catches render errors in the providers/shell that the per-screen boundary in App can't reach. */}
      <ErrorBoundary>
        <ThemeProvider initial={themePref}>
          <AccountProvider>
            <ObsProvider>
              <App initialConfig={cfg} />
            </ObsProvider>
          </AccountProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Log stray async rejections for diagnostics; do NOT blank the window since a non-fatal rejection shouldn't replace the UI.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

boot().catch((err) => renderFatal(err instanceof Error ? err.message : String(err)));

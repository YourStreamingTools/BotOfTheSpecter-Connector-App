import React from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

/** Resolve a preference to a concrete theme, consulting the OS for 'system'. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

function applyTheme(pref: ThemePref): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
}

interface ThemeContextValue {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePref>(initial);

  React.useEffect(() => {
    applyTheme(theme);
    // While following the system, re-apply whenever the OS light/dark setting flips.
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback((t: ThemePref) => {
    setThemeState(t);
    void window.api.config.set('theme', t);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}

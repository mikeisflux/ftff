import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

// Applies theme tokens as CSS custom properties on :root and manages the
// dark/light mode (§7.0a, §13.3). Mode persists to localStorage; tokens come
// from the cached /theme endpoint.

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

function applyTokens(theme, mode) {
  if (!theme) return;
  const palette = theme.tokens?.[mode] || theme.tokens?.dark || {};
  const root = document.documentElement;
  for (const [k, v] of Object.entries(palette)) {
    root.style.setProperty(`--color-${k}`, v);
  }
  root.style.setProperty('--glow-color', theme.glow_color || palette.primary || '#7c3aed');
  root.style.setProperty('--glow-intensity', String((theme.glow_intensity ?? 60) / 100));
  root.style.setProperty('--radius', theme.radius || '12px');
  root.style.setProperty('--font-display', theme.font_display || 'Orbitron');
  root.style.setProperty('--font-body', theme.font_body || 'Inter');
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('theme-mode');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    api('/theme')
      .then(({ theme }) => {
        setTheme(theme);
        // First-time visitor (no saved choice) honors theme.default_mode.
        if (!localStorage.getItem('theme-mode') && theme?.default_mode) {
          setMode(theme.default_mode);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    applyTokens(theme, mode);
    document.documentElement.setAttribute('data-theme', mode);
  }, [theme, mode]);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme-mode', next);
      return next;
    });
  }, []);

  const allowToggle = theme?.allow_user_toggle !== false;

  return (
    <ThemeCtx.Provider value={{ theme, mode, toggle, allowToggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

'use client';

import { useEffect, useState } from 'react';

type Mode = 'system' | 'light' | 'dark';

/** Theme preference is a per-viewer convenience, so it lives in localStorage. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('launchos-theme') as Mode | null;
      if (saved) setMode(saved);
    } catch { /* private mode or blocked storage: fall back to system */ }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try { localStorage.setItem('launchos-theme', mode); } catch { /* ignore */ }
  }, [mode]);

  const next: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' };
  const icon: Record<Mode, string> = { system: '◐', light: '☀', dark: '☾' };

  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => setMode(next[mode])}
      title={`Theme: ${mode}. Click for ${next[mode]}.`}
      aria-label={`Theme: ${mode}. Switch to ${next[mode]}.`}
    >
      <span aria-hidden>{icon[mode]}</span>
      <span className="hidden sm:inline">{mode}</span>
    </button>
  );
}

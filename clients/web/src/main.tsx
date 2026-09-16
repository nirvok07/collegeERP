import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/base.css';
import { App } from './App.tsx';
import { readStoredTheme, writeTheme } from './design/theme.ts';

// Apply a remembered theme from first paint, so the sign-in page (rendered
// before the signed-in shell mounts its toggle) matches the last choice.
const stored = readStoredTheme();
if (stored === 'light' || stored === 'dark') writeTheme(stored);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

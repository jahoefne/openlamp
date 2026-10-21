import './viewport/zUp.ts';
import './styles/tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initPersistence } from './persistence/session.ts';

// Before the first render, so the first build is of the project the page opens.
initPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

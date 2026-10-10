import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '@fontsource-variable/public-sans';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';

if (import.meta.env.DEV) import('./dev/capture');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

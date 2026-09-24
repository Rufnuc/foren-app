import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupPwaAutoUpdate } from './lib/pwaUpdate';
import './index.css';

// Keep installed home-screen apps up to date without a reinstall.
setupPwaAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import ConfigNeeded from './components/ConfigNeeded';
import { missingEnv } from './lib/env';
import './index.css';

/**
 * A missing VITE_ var used to throw at module scope, which meant React never
 * mounted and whoever hit it got a blank page with an error only in the console.
 * Now the check happens here, where there is a root to render an explanation
 * into. See lib/env.ts.
 */
const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {missingEnv.length > 0 ? (
      <ConfigNeeded />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);

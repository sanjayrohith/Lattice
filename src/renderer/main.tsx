import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { PopoutApp, parsePopoutRoute } from './app/PopoutApp';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles/theme.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('root element not found');
}

const isPopout = Boolean(parsePopoutRoute(window.location.hash));

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>{isPopout ? <PopoutApp hash={window.location.hash} /> : <App />}</ErrorBoundary>
  </StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/components.css';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element not found. Ensure index.html contains a #root div.');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

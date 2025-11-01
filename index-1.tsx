

import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Corrected import path to point to the corresponding App-1 component.
import App from './App-1';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
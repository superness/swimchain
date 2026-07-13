import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, RpcProvider } from '@swimchain/react';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SwimchainProvider fallback={<div className="center muted">Loading crypto…</div>}>
      <RpcProvider>
        <App />
      </RpcProvider>
    </SwimchainProvider>
  </React.StrictMode>
);

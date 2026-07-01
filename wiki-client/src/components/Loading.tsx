/**
 * Loading screen shown during WASM initialization
 */

import './Loading.css';

export function LoadingScreen(): JSX.Element {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-content">
        <div className="loading-spinner" aria-hidden="true">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <h1 className="loading-title">Swimchain Wiki</h1>
        <p className="loading-message">Initializing wiki...</p>
        <p className="loading-hint">Loading WASM modules</p>
      </div>
    </div>
  );
}

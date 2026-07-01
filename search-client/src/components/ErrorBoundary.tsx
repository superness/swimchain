/**
 * Error boundary component for graceful error handling
 */

import React from 'react';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const isWasmError =
        error?.message?.toLowerCase().includes('wasm') ||
        error?.message?.toLowerCase().includes('webassembly') ||
        error?.message?.toLowerCase().includes('module');

      const isDev = import.meta.env.DEV;

      return (
        <div className="error-boundary">
          <div className="error-content">
            <h1 className="error-title">Something went wrong</h1>
            <p className="error-message">
              {error?.message || 'An unexpected error occurred'}
            </p>
            {isWasmError && (
              <p className="error-hint">
                This may be a WASM loading issue. Try reloading the page or
                check that your browser supports WebAssembly.
              </p>
            )}
            <div className="error-actions">
              <button
                className="error-button primary"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                className="error-button secondary"
                onClick={this.handleReload}
              >
                Reload Page
              </button>
            </div>
            {isDev && errorInfo?.componentStack && (
              <details className="error-details">
                <summary>Component Stack</summary>
                <pre>{errorInfo.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error Boundary component for catching React errors
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { logger } from '../lib/logger';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    logger.error('===== REACT ERROR BOUNDARY CAUGHT ERROR =====', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-content">
            <h1 className="error-title">Something went wrong</h1>
            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            {this.state.error?.message?.includes('WASM') && (
              <p className="error-hint">
                The Swimchain core library failed to initialize. This may be due to
                browser compatibility issues or network problems.
              </p>
            )}
            <div className="error-actions">
              <button
                className="error-button primary"
                onClick={this.handleRetry}
                type="button"
              >
                Try Again
              </button>
              <button
                className="error-button secondary"
                onClick={() => window.location.reload()}
                type="button"
              >
                Reload Page
              </button>
            </div>
            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="error-details">
                <summary>Technical Details</summary>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

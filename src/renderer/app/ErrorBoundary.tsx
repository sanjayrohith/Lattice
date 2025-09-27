import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

/**
 * A top-level crash barrier: any uncaught error thrown while rendering the
 * component tree beneath this boundary is caught here and replaced with a
 * recoverable crash panel instead of tearing down the entire renderer.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] uncaught error in component tree', error, info.componentStack);
  }

  private readonly handleReset = (): void => {
    this.setState({ error: undefined });
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (error) {
      return (
        <div role="alert" className="crash-panel">
          <h1>Something went wrong</h1>
          <p>{error.message}</p>
          <button type="button" onClick={this.handleReset}>
            Try to recover
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

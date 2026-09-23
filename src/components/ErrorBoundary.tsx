import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Intentionally minimal: do not ship error contents to any remote service.
    // eslint-disable-next-line no-console
    console.error('Foren error boundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="app-shell items-center justify-center px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-primary">Something went wrong</h2>
            <p className="mt-2 text-sm text-secondary">
              Your data is safe on this device. Try reopening the app.
            </p>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

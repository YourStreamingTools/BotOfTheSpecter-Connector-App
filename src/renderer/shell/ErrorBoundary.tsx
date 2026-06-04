import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback; receives the caught error and a reset() to retry rendering. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors in its subtree and shows a fallback so a broken screen keeps the shell usable instead of blanking the window. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface for diagnostics; the UI shows the fallback. No secrets here — these are render errors, not data.
    console.error('Renderer error boundary caught:', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="card" style={{ margin: 16 }}>
          <div className="card-head"><h3>Something went wrong</h3></div>
          <p className="dim" style={{ fontSize: 12, margin: '8px 0 12px' }}>{error.message}</p>
          <button className="btn btn-sm" onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

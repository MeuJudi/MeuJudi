"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Erro de renderização</p>
          <p className="mt-1 font-mono text-xs break-all">
            {this.state.error.message}
          </p>
          {this.state.error.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">Stack</summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-[10px]">
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded border border-destructive/40 px-3 py-1 text-xs font-semibold hover:bg-destructive/20"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

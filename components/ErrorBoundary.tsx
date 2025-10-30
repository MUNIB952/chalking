import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorIcon } from './icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center p-8">
            <div className="text-center bg-gray-800/50 border border-red-500/50 rounded-2xl p-8 max-w-lg">
                <ErrorIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong.</h1>
                <p className="text-red-300 mb-4">
                    The drawing assistant encountered an unexpected error. This might be due to a problem with the AI's response or a temporary issue.
                </p>
                <p className="text-gray-400 text-sm mb-6">
                    <code>{this.state.error?.message || 'An unknown error occurred.'}</code>
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-cyan-500/80 text-white font-bold rounded-full hover:bg-cyan-500 transition-colors"
                >
                    Reload Application
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

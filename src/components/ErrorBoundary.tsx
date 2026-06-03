// @ts-nocheck
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: error.message, stack: error.stack, componentStack: errorInfo.componentStack })
      }).catch(() => {});
    } catch(e) {}
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      let errorDetails: any = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#0A2E46] flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[32px] p-8 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black italic uppercase tracking-tight">Something went wrong</h2>
                <p className="text-slate-400 text-sm font-medium">
                  We encountered an unexpected error. Please reload the application to continue.
                </p>
              </div>

              {errorDetails && (
                <div className="w-full bg-black/40 rounded-2xl p-4 text-left border border-white/5 space-y-2 overflow-hidden">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">Error Diagnostics</p>
                  <p className="text-[11px] font-mono text-slate-300 break-words line-clamp-3">
                    {errorDetails.error || 'Unknown Error'}
                  </p>
                  <div className="flex gap-4 pt-1">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      OP: <span className="text-sky-400">{errorDetails.operationType}</span>
                    </p>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate flex-1">
                      PATH: <span className="text-sky-400">{errorDetails.path}</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 w-full pt-4">
                <button
                  onClick={this.handleReset}
                  className="w-full h-14 bg-[#F06C22] hover:bg-[#d05b1c] text-white rounded-2xl font-black italic uppercase tracking-[0.1em] flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Reload
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="w-full h-14 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black italic uppercase tracking-[0.1em] flex items-center justify-center gap-3 transition-all active:scale-95"
                >
                  <Home className="w-5 h-5" />
                  Back to Studio Hub
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

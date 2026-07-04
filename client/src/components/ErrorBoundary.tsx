import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

// أي خطأ غير متوقع في صفحة يعرض رسالة واضحة بدل شاشة بيضاء صامتة
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-card border border-border rounded-3xl p-8 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h2 className="font-bold text-lg">حدث خطأ غير متوقع</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                نعتذر عن هذا الخلل. بياناتك سليمة ولم تتأثر — هذه مشكلة عرض فقط.
              </p>
              {this.state.message && (
                <p className="mt-3 text-[11px] text-muted-foreground/70 font-mono break-all bg-muted/40 rounded-lg p-2" dir="ltr">
                  {this.state.message}
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

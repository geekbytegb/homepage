import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./style.css";

class SiteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Geek Byte page rendering failed",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <span>GEEK BYTE / RECOVERY</span>
          <h1>페이지를 불러오지 못했습니다.</h1>
          <p>
            일시적인 데이터 또는 네트워크 문제일 수 있습니다. 페이지를 다시
            불러오거나 홈으로 이동해 주세요.
          </p>
          <div>
            <button onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
            <a href="/">홈으로 이동</a>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SiteErrorBoundary>
  </React.StrictMode>,
);

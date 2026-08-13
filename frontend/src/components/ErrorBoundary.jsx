import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#b91c1c" }}>Something went wrong</h2>
          <p>
            This page hit an unexpected error and couldn't render. Check the
            browser console for details, or reload the page to try again.
          </p>
          <pre
            style={{
              background: "#fee2e2",
              padding: 12,
              borderRadius: 6,
              whiteSpace: "pre-wrap",
              fontSize: 13,
            }}
          >
            {String(this.state.error.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

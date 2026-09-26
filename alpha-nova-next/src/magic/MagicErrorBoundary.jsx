import { Component } from 'react';

export default class MagicErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="magic-fallback" aria-hidden="true" />
      : this.props.children;
  }
}

import { Component, ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

// Release builds suppress RN's red-box, so an uncaught render error otherwise
// just shows a blank screen with zero diagnostics. This makes it visible.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 }}>
        <Text style={{ color: '#ec3013', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>
          Crashed
        </Text>
        <ScrollView>
          <Text style={{ color: '#f8f4f4', fontSize: 14, fontFamily: 'Menlo' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

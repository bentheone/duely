jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: (_t, name) => (props) => React.createElement('Icon', { ...props, name: String(name) }) });
});
jest.mock('@react-native-community/datetimepicker', () => ({ DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({}), Redirect: () => null }));
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

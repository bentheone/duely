// Custom entry: expo-router + the Android widget headless task handler (§11.3 #12).
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/task-handler';

registerWidgetTaskHandler(widgetTaskHandler);

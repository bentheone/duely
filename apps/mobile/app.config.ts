import type { ExpoConfig } from 'expo/config';

const API_URL = process.env.API_URL ?? 'http://10.0.2.2:3000';
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID ?? '';

const config: ExpoConfig = {
  name: 'Duely',
  slug: 'duely',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'duely',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FFFFFF',
  android: {
    package: 'app.duely',
    adaptiveIcon: {
      backgroundColor: '#111317',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.CAMERA',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#FFFFFF', image: './assets/images/splash-icon.png', imageWidth: 76, dark: { backgroundColor: '#0E0F12' } }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    '@react-native-google-signin/google-signin',
    ['expo-notifications', { color: '#111317' }],
    ['react-native-document-scanner-plugin', { cameraPermission: 'Duely uses the camera to scan handouts into PDFs.' }],
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    ['duely-alarm', { useExactAlarm: false }],
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: 'DuelyNext',
            label: 'Duely · Next up',
            description: 'Next class or session and the next two due items',
            minWidth: '250dp',
            minHeight: '110dp',
            targetCellWidth: 4,
            targetCellHeight: 2,
            updatePeriodMillis: 1800000,
          },
          {
            name: 'DuelyDue',
            label: 'Duely · Due this week',
            description: 'How many assignments are due this week',
            minWidth: '110dp',
            minHeight: '110dp',
            targetCellWidth: 2,
            targetCellHeight: 2,
            updatePeriodMillis: 1800000,
          },
          {
            name: 'DuelyExam',
            label: 'Duely · Next exam',
            description: 'Countdown to your next exam',
            minWidth: '110dp',
            minHeight: '110dp',
            targetCellWidth: 2,
            targetCellHeight: 2,
            updatePeriodMillis: 1800000,
          },
        ],
      },
    ],
  ],
  experiments: { typedRoutes: false, reactCompiler: true },
  extra: {
    API_URL,
    GOOGLE_WEB_CLIENT_ID,
    GOOGLE_ANDROID_CLIENT_ID,
    eas: { 
      projectId: '0ae9538e-49ab-4efd-ab8b-9a31399f5ebf'
    },
  },
};

export default config;

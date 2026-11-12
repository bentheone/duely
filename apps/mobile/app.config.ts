import type { ExpoConfig } from 'expo/config';

const API_URL = process.env.API_URL ?? 'http://10.0.2.2:3000';
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID ?? '';
// GitHub Actions run number of the APK build (0 = EAS / local build). The in-app update check compares it.
const BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER ?? 0) || 0;
const UPDATES_REPO = process.env.UPDATES_REPO ?? 'bentheone/duely';

const config: ExpoConfig = {
  name: 'Duely',
  slug: 'duely',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/brand/expo/icon.png',
  scheme: 'duely',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FFFFFF',
  android: {
    package: 'app.duely',
    adaptiveIcon: {
      backgroundColor: '#111317',
      foregroundImage: './assets/brand/expo/adaptive-icon-foreground.png',
      monochromeImage: './assets/brand/expo/adaptive-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.CAMERA',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/brand/expo/splash-icon.png',
        imageWidth: 160,
        dark: { backgroundColor: '#0E0F12', image: './assets/brand/expo/splash-icon-dark.png' },
      },
    ],
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    '@react-native-google-signin/google-signin',
    ['expo-notifications', { color: '#EA580C', icon: './assets/brand/expo/notification-icon.png' }],
    ['react-native-document-scanner-plugin', { cameraPermission: 'Duely uses the camera to scan handouts into PDFs.' }],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          // Phones only: arm64 covers every current Android phone; x86/armv7 tripled the APK (~120 MB).
          buildArchs: ['arm64-v8a'],
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    ['duely-alarm', { useExactAlarm: true }],
    ['expo-audio', { microphonePermission: 'Duely records voice notes for your lectures.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Duely adds photos to your lecture notes.',
        cameraPermission: 'Duely takes photos of the board for your lecture notes.',
        microphonePermission: false,
      },
    ],
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
    BUILD_NUMBER,
    UPDATES_REPO,
    eas: { 
      projectId: '0ae9538e-49ab-4efd-ab8b-9a31399f5ebf'
    },
  },
};

export default config;

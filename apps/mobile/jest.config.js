/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1', '^@duely/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|lucide-react-native|chrono-node|drizzle-orm))',
  ],
};

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gachon.kendo',
  appName: '가천대 검도부',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
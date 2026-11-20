import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type AppUsage = {
  packageName: string;
  label: string;
  bytes: number;
};

declare class ExpoNetworkUsageModule extends NativeModule {
  getTotalBytes(): Promise<{ rx: number; tx: number }>;
  getMobileBytes(): Promise<{ rx: number; tx: number }>;
  getTodayTotals(): Promise<{ mobile: number; wifi: number }>;
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): Promise<boolean>;
  startSession(): Promise<number>;
  getSessionStart(): Promise<number>;
  getAppUsage(): Promise<AppUsage[]>;
  startSpeedService(): Promise<boolean>;
  stopSpeedService(): Promise<boolean>;
}

export default requireNativeModule<ExpoNetworkUsageModule>('ExpoNetworkUsage');

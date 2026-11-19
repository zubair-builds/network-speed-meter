import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class ExpoNetworkUsageModule extends NativeModule {
  getTotalBytes(): Promise<{ rx: number; tx: number }>;
  getMobileBytes(): Promise<{ rx: number; tx: number }>;
  getTodayTotals(): Promise<{ mobile: number; wifi: number }>;
  getIconSettings(): Promise<{ size: number; style: string }>;
  setIconSize(size: number): Promise<boolean>;
  setIconStyle(style: string): Promise<boolean>;
  canDrawOverlay(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  startSpeedService(): Promise<boolean>;
  stopSpeedService(): Promise<boolean>;
}

export default requireNativeModule<ExpoNetworkUsageModule>('ExpoNetworkUsage');

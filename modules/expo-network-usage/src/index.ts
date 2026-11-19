import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class ExpoNetworkUsageModule extends NativeModule {
  getTotalBytes(): Promise<{ rx: number; tx: number }>;
  getMobileBytes(): Promise<{ rx: number; tx: number }>;
  canDrawOverlay(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showOverlay(text: string): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
}

export default requireNativeModule<ExpoNetworkUsageModule>('ExpoNetworkUsage');

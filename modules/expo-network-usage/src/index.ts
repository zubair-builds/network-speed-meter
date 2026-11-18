import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class ExpoNetworkUsageModule extends NativeModule {
  getTotalBytes(): Promise<{ rx: number; tx: number }>;
  getMobileBytes(): Promise<{ rx: number; tx: number }>;
}

export default requireNativeModule<ExpoNetworkUsageModule>('ExpoNetworkUsage');

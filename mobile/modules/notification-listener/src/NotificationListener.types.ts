export type NotificationListenerNativeModule = {
  getModuleName(): string;
  pingAsync(): Promise<boolean>;
};

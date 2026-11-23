export type NotificationSource = "VIETCOMBANK" | "MBBANK" | "MOMO";

export type NotificationQueueStatus =
  | "PENDING"
  | "WAITING_WALLET"
  | "SENDING"
  | "RETRY_WAIT"
  | "AUTH_REQUIRED"
  | "SENT"
  | "SENT_DUPLICATE"
  | "DELIVERED_REJECTED"
  | "DEAD_LETTER";

export type QueueCounts = Record<NotificationQueueStatus, number>;

export type WalletMappings = Partial<Record<NotificationSource, string>>;

export type SetWalletMappingResult = {
  source: NotificationSource;
  walletId: string;
  promotedCount: number;
};

export type NotificationListenerNativeModule = {
  getModuleName(): string;

  pingAsync(): Promise<boolean>;

  isNotificationAccessEnabledAsync(): Promise<boolean>;

  openNotificationAccessSettingsAsync(): Promise<boolean>;

  getCollectionPausedAsync(): Promise<boolean>;

  setCollectionPausedAsync(paused: boolean): Promise<boolean>;

  setWalletMappingAsync(
    source: NotificationSource,
    walletId: string,
  ): Promise<SetWalletMappingResult>;

  getWalletMappingsAsync(): Promise<WalletMappings>;

  getQueueCountsAsync(): Promise<QueueCounts>;
};

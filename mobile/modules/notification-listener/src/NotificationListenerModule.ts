import { requireNativeModule } from "expo";

import type { NotificationListenerNativeModule } from "./NotificationListener.types";

export default requireNativeModule<NotificationListenerNativeModule>(
  "NotificationListener",
);

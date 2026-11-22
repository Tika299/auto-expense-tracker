package expo.modules.notificationlistener

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Function("getModuleName") {
      "NotificationListener"
    }

    AsyncFunction("pingAsync") {
      true
    }
  }
}

package expo.modules.notificationlistener

enum class SupportedSource(
    val packageName: String,
    val backendSource: String,
) {
    VIETCOMBANK(
        packageName = "com.VCB",
        backendSource = "VIETCOMBANK",
    ),
    MBBANK(
        packageName = "com.mbmobile",
        backendSource = "MBBANK",
    ),
    MOMO(
        packageName = "com.mservice.momotransfer",
        backendSource = "MOMO",
    );

    companion object {
        private val byPackageName: Map<String, SupportedSource> =
            entries.associateBy { it.packageName }

        fun fromPackageName(packageName: String?): SupportedSource? {
            if (packageName.isNullOrEmpty()) return null
            return byPackageName[packageName]
        }
    }
}
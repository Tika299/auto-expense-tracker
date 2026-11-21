if(NOT TARGET kolibri-android::kolibri)
add_library(kolibri-android::kolibri STATIC IMPORTED)
set_target_properties(kolibri-android::kolibri PROPERTIES
    IMPORTED_LOCATION "C:/Users/Xuan Vu/.gradle/caches/9.4.1/transforms/c13aedea9aa19b3bd0dd547b24a23340/transformed/kolibri-android-0.2.4/prefab/modules/kolibri/libs/android.arm64-v8a/libkolibri.a"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Xuan Vu/.gradle/caches/9.4.1/transforms/c13aedea9aa19b3bd0dd547b24a23340/transformed/kolibri-android-0.2.4/prefab/modules/kolibri/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


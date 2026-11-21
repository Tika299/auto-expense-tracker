if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "C:/Users/Xuan Vu/.gradle/caches/9.4.1/transforms/dd880d5aa5ce20ca49c859fd3dd57eed/transformed/hermes-android-260318099.0.5-debug/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Xuan Vu/.gradle/caches/9.4.1/transforms/dd880d5aa5ce20ca49c859fd3dd57eed/transformed/hermes-android-260318099.0.5-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


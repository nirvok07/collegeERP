plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    // The canonical application identity, requirement R2. The Kotlin package of
    // MainActivity must match it, because the manifest names the activity
    // relative to this namespace.
    namespace = "com.nirvok.collegeErp"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Requirement R2. Must match a client registered in the Firebase project:
        // the google-services plugin refuses to build when google-services.json
        // has no client for this id.
        // See docs/12-mobile-platform-config.md.
        applicationId = "com.nirvok.collegeErp"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // AD-72: two apps from one codebase. The college app keeps the canonical id
    // (R2). The super admin app is its own install, with its own id and entry
    // point (lib/main_admin.dart), and has no Firebase client: its variants
    // skip the google-services and Crashlytics tasks, below.
    flavorDimensions += "app"
    productFlavors {
        create("college") {
            dimension = "app"
            resValue("string", "app_name", "College")
        }
        create("admin") {
            dimension = "app"
            applicationIdSuffix = ".admin"
            resValue("string", "app_name", "Super Admin")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// AD-72: no Firebase client is registered for the super admin app, and it uses
// no Firebase service, so its variants never run the Firebase build steps.
tasks.configureEach {
    if (name.contains("Admin") && (name.contains("GoogleServices") || name.contains("Crashlytics"))) {
        enabled = false
    }
}

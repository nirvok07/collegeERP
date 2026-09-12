plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
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
        //
        // PENDING: google-services.json is still registered to the previous id,
        // com.example.college_erp, so this build fails at the Google Services
        // step until an Android app for com.nirvok.collegeErp is registered in
        // Firebase and `flutterfire configure` is re-run. The file is not edited
        // by hand, because that would fake a registration that does not exist.
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

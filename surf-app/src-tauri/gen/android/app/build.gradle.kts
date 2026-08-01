import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// --- Release signing (C4) ---
// Resolves the 4 signing inputs from, in order: a gitignored `keystore.properties`
// sitting next to this file (local/operator dev), else CI env vars
// (SURF_KEYSTORE_FILE / SURF_KEYSTORE_PASSWORD / SURF_KEY_ALIAS / SURF_KEY_PASSWORD).
// See `keystore.properties.example` for the file format and `README.md`'s
// "Release signing (C4)" section for the full recipe.
//
// Absent-secret behavior (deliberate, do not "fix" without re-reading this):
//   - The DEBUG build is completely unaffected — it is never touched below and
//     keeps AGP's built-in debug signing.
//   - Config EVALUATION must NOT throw. `gradlew tasks`, `gradlew :app:signingReport`,
//     and any debug build all evaluate this file and must succeed even with zero
//     secrets present — so nothing below throws eagerly at script-evaluation time.
//   - Only an ACTUAL release assembly (a task graph containing a task whose name
//     contains "Release", e.g. assembleArm64Release/bundleRelease) with no secrets
//     available must fail, and must fail with a clear, actionable message — never
//     silently emit an unsigned "release" APK that looks shippable. This is done by
//     deferring the check to `gradle.taskGraph.whenReady`, which runs once the
//     requested task graph is known but before any task executes.
val keystorePropertiesFile = file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

fun releaseSigningInput(propertyKey: String, envVar: String): String? =
    keystoreProperties.getProperty(propertyKey)?.takeIf { it.isNotBlank() }
        ?: System.getenv(envVar)?.takeIf { it.isNotBlank() }

val releaseStoreFilePath = releaseSigningInput("storeFile", "SURF_KEYSTORE_FILE")
val releaseStorePassword = releaseSigningInput("storePassword", "SURF_KEYSTORE_PASSWORD")
val releaseKeyAlias = releaseSigningInput("keyAlias", "SURF_KEY_ALIAS")
val releaseKeyPassword = releaseSigningInput("keyPassword", "SURF_KEY_PASSWORD")
val releaseSigningAvailable =
    releaseStoreFilePath != null &&
        releaseStorePassword != null &&
        releaseKeyAlias != null &&
        releaseKeyPassword != null

gradle.taskGraph.whenReady {
    val releaseTaskRequested = allTasks.any { it.name.contains("Release", ignoreCase = true) }
    if (releaseTaskRequested && !releaseSigningAvailable) {
        throw GradleException(
            "Surf release signing is not configured — refusing to build an " +
                "unsigned release APK.\n" +
                "Provide credentials one of two ways:\n" +
                "  1. Create surf-app/src-tauri/gen/android/app/keystore.properties " +
                "(copy keystore.properties.example, fill in the 4 keys) — gitignored, " +
                "never commit it.\n" +
                "  2. Set env vars: SURF_KEYSTORE_FILE, SURF_KEYSTORE_PASSWORD, " +
                "SURF_KEY_ALIAS, SURF_KEY_PASSWORD (CI).\n" +
                "See surf-app/README.md, \"Release signing (C4)\" for the full recipe."
        )
    }
}

android {
    compileSdk = 36
    namespace = "com.swimchain.surf"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.swimchain.surf"
        minSdk = 26
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            // Left unset (AGP defaults / null) when secrets aren't available — see the
            // "Absent-secret behavior" comment above. The buildTypes.release block below
            // only attaches this signingConfig when releaseSigningAvailable is true; the
            // taskGraph.whenReady guard above is what actually blocks an unsigned release
            // assembly.
            if (releaseSigningAvailable) {
                storeFile = file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            if (releaseSigningAvailable) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
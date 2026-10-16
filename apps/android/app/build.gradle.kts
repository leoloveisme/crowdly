plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// The backend the app talks to until the user picks another one in Settings.
// Override per build: ./gradlew assembleDebug -Pcrowdly.server=http://192.168.1.20:4000
val debugServer = (findProperty("crowdly.server") as String?) ?: "http://10.0.2.2:4000"
val releaseServer = (findProperty("crowdly.releaseServer") as String?) ?: "https://crowdly.cloud"

android {
    namespace = "cloud.crowdly.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "cloud.crowdly.app"
        minSdk = 29
        targetSdk = 36
        versionCode = (findProperty("crowdly.versionCode") as String?)?.toInt() ?: 1
        versionName = (findProperty("crowdly.versionName") as String?) ?: "0.1.0"
    }

    signingConfigs {
        // Release signing comes from the environment (GitHub secrets in CI);
        // without it, release builds stay unsigned.
        val storeFile = System.getenv("CROWDLY_KEYSTORE")
        if (storeFile != null) {
            create("release") {
                this.storeFile = file(storeFile)
                storePassword = System.getenv("CROWDLY_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CROWDLY_KEY_ALIAS")
                keyPassword = System.getenv("CROWDLY_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "DEFAULT_SERVER", "\"$debugServer\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "DEFAULT_SERVER", "\"$releaseServer\"")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":core"))
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.documentfile)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.guava)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}

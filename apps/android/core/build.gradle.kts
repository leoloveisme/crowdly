// Pure-Kotlin logic shared by the app and its JVM tests: the Crowdly file
// formats (.story/.screenplay/.comic/.master), branch sync, diffing and
// the reader's block model. No Android imports here, so it can move to a
// Kotlin Multiplatform module for iOS later.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}

tasks.test {
    // The fixtures shared with the desktop app and the web app.
    systemProperty("crowdly.fixtures", rootProject.file("../desktop/tests/fixtures/formats").absolutePath)
    systemProperty("crowdly.desktopTests", rootProject.file("../desktop/tests").absolutePath)
}

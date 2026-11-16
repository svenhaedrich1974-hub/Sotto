import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val ks = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.sotto.diary"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.sotto.diary"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.1"
    }

    signingConfigs {
        create("release") {
            if (ks.getProperty("storeFile") != null) {
                storeFile = rootProject.file(ks.getProperty("storeFile"))
                storePassword = ks.getProperty("storePassword")
                keyAlias = ks.getProperty("keyAlias")
                keyPassword = ks.getProperty("keyPassword")
                storeType = "pkcs12"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (ks.getProperty("storeFile") != null) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            // Debug mit demselben Schluessel signieren: Installation ueber die bestehende App, Daten bleiben erhalten.
            if (ks.getProperty("storeFile") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
implementation("com.android.billingclient:billing-ktx:7.1.1")
}

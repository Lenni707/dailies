import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The app bundles the same web files that GitHub Pages serves (repo root).
abstract class CopyWeb : DefaultTask() {
    @get:InputFiles abstract val files: ConfigurableFileCollection
    @get:InputDirectory abstract val icons: DirectoryProperty
    @get:OutputDirectory abstract val out: DirectoryProperty
    @get:Inject abstract val fs: FileSystemOperations

    @TaskAction fun run() {
        fs.sync {
            into(out)
            from(files)
            from(icons) { into("icons") }
        }
    }
}

val web = rootDir.parentFile
val copyWeb = tasks.register<CopyWeb>("copyWeb") {
    files.from(listOf("index.html", "style.css", "app.js", "manifest.webmanifest").map { web.resolve(it) })
    icons.set(web.resolve("icons"))
    out.set(layout.buildDirectory.dir("generated/web"))
}

android {
    namespace = "app.dailies"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.dailies"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${versionCode}"
    }

    signingConfigs {
        create("release") {
            val ks = System.getenv("DAILIES_KEYSTORE")
            if (ks != null) {
                storeFile = file(ks)
                storeType = "pkcs12"
                storePassword = System.getenv("DAILIES_KEY_PASS")
                keyAlias = "dailies"
                keyPassword = System.getenv("DAILIES_KEY_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (System.getenv("DAILIES_KEYSTORE") != null)
                signingConfigs["release"] else signingConfigs["debug"]
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    lint { checkReleaseBuilds = false }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWeb, CopyWeb::out)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.glance:glance-appwidget:1.1.1")
}

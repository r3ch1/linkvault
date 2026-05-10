# Android build — manual steps

> 🇧🇷 [Versão em português](android-build.md)

Initializing the Android project (creating `gen/android/`, AndroidManifest, etc) requires Android SDK + NDK installed and **must be done once per machine**. There's no way to automate it in CI without cached SDKs.

## 1. Prerequisites

- **Android Studio** installed (ships SDK Manager) — or just SDK Command-Line Tools
- **JDK 17+** (Android Studio bundles one, or `apt install openjdk-17-jdk`)
- **Android SDK** with:
  - Android SDK Platform 34+
  - Android NDK (Side by side) — version >= 25
  - Android SDK Build-Tools 34+
- Environment variables (in your `.bashrc` / `.zshrc`):
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export NDK_HOME=$ANDROID_HOME/ndk/<version>   # e.g. 26.1.10909125
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
  ```
- **Rust targets** for Android:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

Up-to-date official docs: https://v2.tauri.app/start/prerequisites/#android

## 2. Initialize the Android project

From the repo root:

```bash
npm run tauri -- android init
```

This creates `src-tauri/gen/android/` with the Gradle project and `AndroidManifest.xml`.

> The `src-tauri/gen/android/` directory is **committed** (goes into git) — so others cloning the repo don't need to re-run `init`. Only `gen/schemas` is regenerated each build (already gitignored).

## 3. Add the Share intent-filter (manual)

Edit `src-tauri/gen/android/app/src/main/AndroidManifest.xml` and add inside the main `<activity>`:

```xml
<!-- Receive shared links -->
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
</intent-filter>

<!-- Receive audio files (Phase 3 final) -->
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="audio/*" />
</intent-filter>
```

## 4. Run in dev (with a device on USB or emulator running)

```bash
adb devices    # confirm the device shows up
npm run tauri -- android dev
```

Tauri compiles Rust for the device's architecture, installs the debug APK, and opens the app with frontend hot-reload.

## 5. Release build

```bash
npm run tauri -- android build
```

Signed APK output lands in `src-tauri/gen/android/app/build/outputs/apk/`.

> To publish to the Play Store you need to create your own keystore and configure signing. Details: https://v2.tauri.app/distribute/sign/android/

## 6. Pairing

Once the app is running on Android:

1. **On desktop**: Settings → "Conectar Android (gerar QR)" → shows the QR (60s TTL).
2. **On Android**: Settings → "Importar do desktop" → "Escanear QR Code" → camera opens, point at the desktop.
3. After confirmation, storage config and AI keys are copied into the Android Keystore. Bookmarks appear automatically because both devices now read the same bucket/folder.

If the camera fails, there's a **copy/paste fallback**: click "Copy" on desktop, send the JSON to your Android (Telegram saved messages, email to yourself, etc), pick "Colar payload JSON" on Android and paste it.

## Common issues

**"NDK_HOME not set"**:
- Verify `NDK_HOME` points to the right version. `ls $ANDROID_HOME/ndk/` lists installed ones.

**"linker `aarch64-linux-android-clang` not found"**:
- Rust target for Android missing. Run the `rustup target add` from section 1.

**First build is very slow**:
- Normal — Cargo has to compile hundreds of crates for the Android target. Subsequent builds use cache.

**App opens but camera doesn't work**:
- Make sure `tauri-plugin-barcode-scanner` permissions are added to `src-tauri/capabilities/default.json` before building. See the next section.

## Extra Android permissions

After `tauri android init`, edit `src-tauri/capabilities/default.json` and add:

```json
"barcode-scanner:allow-scan",
"barcode-scanner:allow-cancel"
```

And in `src-tauri/gen/android/app/src/main/AndroidManifest.xml`, inside `<manifest>` (NOT inside `<application>`):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

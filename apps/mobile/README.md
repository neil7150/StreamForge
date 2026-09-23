# StreamForge Android development

This app uses a local Expo module to start the Go torrent daemon inside an
Android development build. Expo Go cannot load that native module.

## First-time setup

1. Install Android Studio, Android SDK platform 36, Android SDK Build-Tools 36,
   and an Android NDK. Create an emulator in Android Studio or connect a device
   with USB debugging enabled.
2. Install Go and `gomobile`, then initialize its Android bindings:

   ```powershell
   go install golang.org/x/mobile/cmd/gomobile@latest
   gomobile init
   ```

3. From the repository root, install Java 17 and the JavaScript dependencies:

   ```powershell
   npm install
   npm run setup:android --workspace=apps/mobile
   ```

If the SDK is outside the default `%LOCALAPPDATA%\Android\Sdk` location, set
`ANDROID_HOME`. The AAR build script selects the newest installed NDK unless
`ANDROID_NDK_HOME` is set.

## Run and verify

Start the emulator first, then run this from the repository root:

```powershell
npm run android --workspace=apps/mobile
```

This rebuilds the Go AAR, compiles and installs the Android app, and starts
Metro. For an APK without launching an emulator, run
`npm run build:android --workspace=apps/mobile`. The debug APK is written to
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

Keep Metro bound to the default LAN address when running it separately:
`npm run start --workspace=apps/mobile`. The Android emulator connects to Metro
over IPv4; `expo start --localhost` can bind only to IPv6 on Windows and leave
the app at “Unable to load script.”

The generated `android/` directory, native AAR, and local tool downloads are
ignored by Git. If a verified Gradle distribution archive already exists in
`apps/mobile/.expo/`, the Android run script uses it instead of downloading the
same archive again.

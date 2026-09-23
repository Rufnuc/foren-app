# Foren — Native app (iOS + Android via Capacitor)

## Runtime testing status (2026-08-16)

- **Android: fully tested on the emulator.** Complete round-trip verified:
  onboarding → Argon2id → wrapped key written to the **Android Keystore** →
  cold relaunch reads the Keystore and shows the decoy lock screen → unlock →
  Vault. A device-only bug was found and fixed here (see below).
- **iOS: builds + links completely** (all pods/plugins compile), but the app was
  **not run** because the freshly-downloaded iOS 26.5 simulator runtime's disk
  image would not mount — booting fails with "cannot determine the runtime
  bundle". This needs a privileged step this environment couldn't perform:
  **`sudo killall -9 com.apple.CoreSimulator.CoreSimulatorService`** (then the
  runtime mounts), or a **reboot**. After that: `xcrun simctl create ...` a
  device, `npx cap run ios` (or open in Xcode and Run).

### Device-only bug fixed (would have hit BOTH platforms)

`secureStore.ts` / `biometric.ts` must never `return` the Capacitor plugin proxy
from an `async` function — the promise machinery calls `.then()` on it, which the
native side reports as unimplemented and the awaited promise never settles, so
app init hangs on a blank screen. Each function now imports the plugin and calls
its method inline. Verified fixed on Android.


Foren is a real native app, not just a website. The React app is wrapped with
[Capacitor](https://capacitorjs.com), and the security-sensitive secrets live in
the **OS keystore** rather than in browser storage.

## Why native (the security reason)

A pure web app can't defend its stored secrets: `localStorage`/IndexedDB can be
copied off the device and brute-forced offline, and there is no secure enclave.
Running as a native app fixes the parts that matter:

| Data | Web | Native (this build) |
| --- | --- | --- |
| Wrapped data key + vault config | localStorage | **iOS Keychain / Android Keystore** — hardware-backed, sandboxed to this app, not readable by other apps or a plain storage dump |
| Brute-force attempt counter | localStorage (editable) | **Keystore** — far harder to tamper with |
| Encrypted evidence (bulk) | IndexedDB (ciphertext) | App-sandboxed IndexedDB (still AES-GCM ciphertext) |

The switch is handled by `src/lib/secureStore.ts`: on device it uses
`@aparajita/capacitor-secure-storage` (Keychain/Keystore); on the web it falls
back to `localStorage`. Everything else (Argon2id envelope crypto, forced-reset
guard, encrypted-at-rest metadata) is unchanged and already verified.

**Still true even on native:** an attacker who fully compromises an unlocked
device, or who extracts the ciphertext, can attempt an offline attack — the
Argon2id cost + a strong passcode/passphrase are the backstop there. Native
storage removes the *easy* offline copy of the small secrets; it is not magic.

## Project layout

- `capacitor.config.ts` — appId/appName (**display name is "Puzzle"** for the
  disguise; change the bundle id to your own before publishing, keep it
  disguise-safe).
- `android/` — generated Android Studio project (committed, buildable).
- `ios/` — generated Xcode project (`pod install` pending, see below).

## Build & run

Prereqs on the Mac:
- **Full Xcode** (not just Command Line Tools) for iOS, plus CocoaPods.
- For Android: a **JDK 21** and the Android SDK. Android Studio bundles both, or
  install via CLI (see "Android build" below). Note: the build needs **JDK 21**
  (the secure-storage plugin targets Java 21), and the Gradle wrapper was bumped
  to **8.7** (8.2.1 couldn't process BouncyCastle 1.79's Java-21 classes).

## Android build (verified — produces a working APK)

Done on this machine via CLI (no Android Studio GUI needed):

```bash
brew install openjdk@21 android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
yes | sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses
sdkmanager --sdk_root="$ANDROID_SDK_ROOT" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
echo "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties
cd android && ./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
```

Install it: drag the APK onto a running emulator, or `adb install app-debug.apk`
on a device with USB debugging enabled. It installs as **"Puzzle"**.

One-time iOS setup:

- **CocoaPods: installed** (`brew install cocoapods`, done).
- **Pods: installed** — `ios/App/Pods` + `App.xcworkspace` are generated. The
  plugins need **iOS 14.0**, so the Podfile and Xcode project deployment target
  are set to 14.0 (already done; don't drop them back to 13).
- **Remaining blocker: full Xcode is NOT installed** on this Mac (only Command
  Line Tools). Install **Xcode** from the App Store, then:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # point at full Xcode
npx cap open ios                                                  # opens App.xcworkspace in Xcode
```

Then press Run in Xcode (pick a simulator or a connected device). If you ever
re-run `pod install` from a terminal whose locale isn't UTF-8, prefix it with
`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

Then, from the project root:

```bash
npm run android   # build web, sync, open Android Studio
npm run ios       # build web, sync, open Xcode
```

Or manually: `npm run build && npx cap sync && npx cap open ios` (or `android`).
Run on a simulator/emulator or a real device from the IDE.

Whenever the web code changes, re-run `npm run cap:sync` (build + copy into the
native projects).

## Biometric unlock (built)

Opt-in Face ID / Touch ID / fingerprint, native only:

- Enable it in **Settings → Security → Face ID / fingerprint** (the row only
  appears when the device has biometrics). Enabling asks for the passcode once,
  then stashes the data key in the keystore.
- On the lock screen, the hidden unlock gesture triggers the biometric prompt;
  cancel/fail falls back to the passcode. The OS prompt says "Unlock Puzzle" —
  never "vault" (`NSFaceIDUsageDescription` in `Info.plist`).
- Tradeoff (by design): with biometrics on, the data key lives in the keystore
  (retrievable via biometric), instead of only being derivable from the
  passcode. It's off by default and can be turned off any time. A stronger
  variant — a Keychain item with `.biometryCurrentSet` OS-enforced access
  control — is a native-code hardening step to consider later.

Web builds never show any biometric UI (`biometricAvailable()` is false off-device).

## App icon & name (done)

- Icon + splash are a **2048-style tile board** (see `assets/` + `scripts/gen-icons.mts`);
  regenerate with `npx @capacitor/assets generate` after editing the source art.
- Display name is **"Puzzle"** and bundle id `com.puzzle.slide` (in
  `Info.plist` / `strings.xml`). Home screen reads as a game, never "Foren".

## Before publishing

- Change the bundle id to your own (keep it disguise-safe).
- Store listing (App Store / Play) should read as a puzzle game.
- Optionally swap the icon/name to match whichever decoy you expect users to
  pick most (2048 / Sudoku / Wordle).

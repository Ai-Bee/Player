# Walkthrough: Digital Signage Player Adaptation

I have adapted the Player application for Kiosk and TV environments. Here is a summary of the changes:

## 1. Static Export Configuration
- Modified `next.config.ts` to output a static site (`output: 'export'`), which solves compatibility with Tizen, WebOS, and generic Kiosks.
- Enabled `unoptimized` images to work without a Node.js image server.

## 2. Capacitor Integration (Android TV / Fire TV)
- Installed Capacitor and initialized the Android platform.
- The `android` folder now contains the native project.
- You can open this in Android Studio to build the APK.

## 3. Platform Hardening
- Added `user-select: none` to `globals.css` to prevent text selection and highlight effects typical of desktop browsers.
- Added `overflow: hidden` to lock the view.

## 4. Input & Accessibility
- Created `lib/player/inputAdapter.ts` for standardized key mapping (ready for advanced usage).
- Added `autoFocus` to the "Retry" button on the Pairing Screen and "Debug Panel" in Settings to ensuring D-pad users can navigate immediately.

## 5. Self-Healing
- Implemented a Watchdog in `PlayerPage` that reloads the application if it detects sustained error states or connectivity issues (experimental logic based on consecutive errors).

## Verification Results
- **Build**: `npm run build` passed successfully, generating the `out` directory.
- **Sync**: `npx cap sync` passed, updating the Android native project with the latest assets.

## Next Steps
1. **Android**: Open `android` folder in Android Studio and press "Run" to deploy to a connected device or emulator.
2. **Samsung/LG**: Zip the contents of the `out` directory (or use their CLI tools) to deploy.
3. **Windows Kiosk**: Point your Kiosk browser to the hosted URL of the `out` directory or serve it locally.

> [!TIP]
> Use `npx cap open android` to quickly launch Android Studio for this project.

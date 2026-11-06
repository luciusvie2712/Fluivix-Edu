# Mobile release checklist

Status: **BLOCKED** for store/device release. The current Expo58/Router58 app has
21 P0 screen identifiers and real API calls; manifest membership is not device
acceptance. The user previously confirmed Android Expo Go login and context
selection. That evidence is limited to those actions.

- [x] Native credentials use SecureStore; no web token-storage fallback.
- [x] Expo Go notification modules are guarded and lazy-loaded to avoid splash failure.
- [x] Development Go/LAN mode and physical-phone API origin are documented.
- [ ] Repeat all mobile tests after final shared-client changes.
- [ ] Fresh Android and iOS production bundles/builds, dependency doctor, version/build numbering.
- [ ] Android SDK/adb + installed development/release app; execute Maestro teacher/student/guardian journeys and manual accessibility/offline/UAT.
- [ ] macOS/Xcode or configured EAS project + Apple credentials/device; signed iOS build and matching UAT.
- [ ] Approved app identity, icons/screenshots, signing/keystore custody and recovery.
- [ ] Real FCM/APNs credentials, consent, physical-device ticket/receipt/open/revocation evidence.
- [ ] Cold-start deep links, tenant/role/child switch, refresh/revoke and no stale data on both native platforms.
- [ ] Store organization accounts, privacy/Data Safety labels, support/privacy URLs, age/child-data and distribution policy review.
- [ ] Named release owner and final approval before store submission.

`pnpm.cmd --filter @fluivix/mobile build` exports bundles; it does not produce an
APK/IPA or prove signed-device behavior. Expo documents that remote push requires
a [development build](https://docs.expo.dev/develop/development-builds/faq/);
Expo Go is insufficient. No store upload or EAS credential provisioning occurred.

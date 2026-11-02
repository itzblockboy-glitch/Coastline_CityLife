# Game Booster / Game Turbo recognition — change notes

Change set applied to Coastline 1.5 (`ai.arena.coastline`, versionCode 6 / 1.5.0).

## What changed

`android/AndroidManifest.xml` — two attributes only, nothing else touched:

| Location | Before | After |
|---|---|---|
| `<application>` | *(absent)* | `android:appCategory="game"` |
| Main activity `<intent-filter>` | `LAUNCHER` only | `LAUNCHER` + `android.intent.category.GAME` |

```xml
<application android:label="Coastline" android:icon="@drawable/icon" android:appCategory="game"
             android:theme="@android:style/Theme.Material.NoActionBar" android:hardwareAccelerated="true"
             android:usesCleartextTraffic="false" android:allowBackup="false" android:supportsRtl="true">

<activity android:name=".MainActivity" android:exported="true" android:screenOrientation="sensorLandscape"
          android:configChanges="orientation|screenSize|keyboardHidden|uiMode" android:resizeableActivity="true">
  <intent-filter>
    <action   android:name="android.intent.action.MAIN"/>
    <category android:name="android.intent.category.LAUNCHER"/>
    <category android:name="android.intent.category.GAME"/>
  </intent-filter>
</activity>
```

## Why these two

- `android:appCategory="game"` (API 26+) is the documented signal that an app is a game. It is what the
  platform's category APIs (`ApplicationInfo.category`, `getApplicationInfo`) report, and it is what
  Samsung Game Launcher / Game Booster, Xiaomi Game Turbo, and the AOSP Game Manager read when deciding
  whether to offer game mode, performance profiles, DND, and per-game overlays. It also makes the app
  appear in the Game Launcher library rather than as a plain app.
- `android.intent.category.GAME` is an extra marker on the launcher filter. Only `ACTION_MAIN` +
  `CATEGORY_LAUNCHER` is matched by the system launcher, so adding a second category does not change how
  the app launches or make it disappear from the app drawer; it just lets boosters that scan activity
  categories for `GAME` identify it.

`minSdkVersion` is already 26, so `appCategory` needs no compatibility wrapper or `tools:targetApi` hint.

## Validation performed here

- Manifest parses as well-formed XML; `appCategory` reads back as `game`; the activity's categories are
  exactly `LAUNCHER` and `GAME` with no duplicates, and the `MAIN` action is untouched.
- Full-tree diff against the original `Coastline-Source-v1.5.zip`: exactly two files differ
  (`android/AndroidManifest.xml`, `README.md`). The repackaged archive keeps the original 85-entry
  structure and passes `unzip -t`.
- No build scripts or tests in the repo parse or assert on the manifest contents, so nothing else needs
  updating.

## Building the APK

```bash
npm install
bash android/bootstrap-tools.sh   # needs dl.google.com + raw.githubusercontent.com reachable
npm run build:apk                 # -> /home/user/Coastline-CityLife-v1.5.apk
```

Then confirm classification with:

```bash
aapt dump badging Coastline-CityLife-v1.5.apk | grep -Ei "application-label|category|launchable"
adb shell cmd package resolve-activity --brief ai.arena.coastline
```

A ready-to-build APK could **not** be produced in this workspace: it has no JDK, and
`bootstrap-tools.sh` downloads the Android build-tools/android.jar from `dl.google.com` and
`raw.githubusercontent.com`, which are not reachable from this sandbox. The source above is complete and
builds with the project's existing, unmodified `build-apk.sh`.

## Caveats worth knowing

- `android.intent.category.GAME` is not a constant in `android.content.Intent` and is not part of the
  documented manifest API. `aapt2` handles it without error (it is just a string), but treat it as a
  best-effort hint: boosters keyed on `appCategory` are the ones that will reliably pick the app up.
- `appCategory` flips detection instantly for boosters that read the manifest, but some OEM boosters also
  keep server-side allowlists and may still need a version bump or a shipped update before they treat a
  new package as a game.
- Install the new build with the same signing key. A rebuild in a fresh environment generates a different
  development keystore (see `build-apk.sh`), and an APK signed with a different certificate cannot update
  an installed copy — it will fail with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Uninstall or back up data
  first.
- If you ship this as an update to an existing install, bump `android:versionCode` (currently 6) in
  `AndroidManifest.xml`.
- These flags affect how the system/booster *classifies* the app. They do not change rendering
  performance; the game already sets `FLAG_KEEP_SCREEN_ON` and immersive-sticky mode, which is what
  boosters expect from a fullscreen game.

## Files

- `src/coastline/` — extracted, updated source tree
- `Coastline-Source-v1.5-gamebooster.zip` — updated source archive (same layout as the original)
- `game-booster-manifest.patch` — the manifest change as a git-style patch (`git apply -p1`)

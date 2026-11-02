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

## The built APK

`dist/Coastline-CityLife-v1.5-game.apk` — 18,403,151 bytes, SHA-256
`0b67b24153b7edbb9e243beb9259e92d0466615f2e58f5e474ec6d25e4b170d7`.

Download it from the repository on this branch:

```
https://github.com/itzblockboy-glitch/Coastline_CityLife/raw/arena/dc2dfb50-coastline-citylife/dist/Coastline-CityLife-v1.5-game.apk
```

or from the `coastline-v1.5-game-apk` artifact on the Actions run. It was built by
`.github/workflows/build-apk.yml` on `ubuntu-latest` using the project's own
`android/build-apk.sh` (build-tools 30.0.3, android-30 android.jar, JDK 11, d8,
zipalign, apksigner). Signer: `CN=Coastline Development, O=Coastline Prototype, C=IN`,
SHA-256 `57ad3e6709e1c107f51cf3a1432642f1ceec49ca18314bb7404225880490efa4`
(v1 + v2 signing schemes present).

### Verification of the built APK

Confirms the packaged *binary* manifest, not just the source XML:

```
$ python3 tools/verify-apk-manifest.py dist/Coastline-CityLife-v1.5-game.apk
...
E: application (line=5)
     android:appCategory = 0
E: intent-filter (line=7)
E: action (line=7)
     android:name = 'android.intent.action.MAIN'
E: category (line=7)
     android:name = 'android.intent.category.LAUNCHER'
E: category (line=7)
     android:name = 'android.intent.category.GAME'

PASS: appCategory = 0 (CATEGORY_GAME), LAUNCHER + GAME categories, MAIN action intact
```

`0` is `ApplicationInfo.CATEGORY_GAME` — the enum value `appCategory="game"` compiles to,
which is why the literal string `game` does not appear in the packaged manifest, and why a
naive `grep game AndroidManifest.xml` on the APK appears to fail. `aapt dump badging` /
`dump xmltree` output for the same APK is saved in `dist/verification.txt`.

Also checked: `unzip -t` clean, 44 files staged under `assets/www/` plus `classes.dex`,
`resources.arsc`, the icon, and v1/v2 signature blocks; `minSdkVersion 26`,
`targetSdkVersion 35`, `versionCode 6`, package `ai.arena.coastline`, launchable activity
`ai.arena.coastline.MainActivity`.

### Rebuilding

```bash
npm install
bash android/bootstrap-tools.sh   # needs dl.google.com + raw.githubusercontent.com reachable
npm run build:apk                 # -> /home/user/Coastline-CityLife-v1.5.apk
```

`APK_OUT`, `COASTLINE_KEYSTORE`, `COASTLINE_KEY_ALIAS`, `COASTLINE_KEYSTORE_PASS` and
`COASTLINE_KEY_PASS` override the output path and signing material. Push to the branch (or
run the workflow manually) to rebuild in CI; the workflow commits the fresh APK back to
`dist/`. Set the `ANDROID_KEYSTORE_BASE64` secret to sign with your release key instead of a
generated development key.

## Caveats worth knowing

- `android.intent.category.GAME` is not a constant in `android.content.Intent` and is not part of the
  documented manifest API. `aapt2` handles it without error (it is just a string), but treat it as a
  best-effort hint: boosters keyed on `appCategory` are the ones that will reliably pick the app up.
- `appCategory` flips detection instantly for boosters that read the manifest, but some OEM boosters also
  keep server-side allowlists and may still need a version bump or a shipped update before they treat a
  new package as a game.
- Install the new build with the same signing key. This APK is signed with a **generated development
  key** (no release keystore was supplied), so it cannot update an already-installed copy signed with your
  delivery key — installing over it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Uninstall the old copy
  first, or rebuild with your key via the `ANDROID_KEYSTORE_BASE64` secret / `COASTLINE_KEYSTORE`.
- The APK was built and statically verified here, but not installed on a physical device or emulator in
  this environment, so on-device booster behaviour is unconfirmed.
- If you ship this as an update to an existing install, bump `android:versionCode` (currently 6) in
  `AndroidManifest.xml`.
- These flags affect how the system/booster *classifies* the app. They do not change rendering
  performance; the game already sets `FLAG_KEEP_SCREEN_ON` and immersive-sticky mode, which is what
  boosters expect from a fullscreen game.

## Files

- `src/coastline/` — extracted, updated source tree
- `Coastline-Source-v1.5-gamebooster.zip` — updated source archive (same layout as the original)
- `game-booster-manifest.patch` — the manifest change as a git-style patch (`git apply -p1`)
- `dist/Coastline-CityLife-v1.5-game.apk` + `dist/verification.txt` — the built, signed APK and its inspection output
- `tools/verify-apk-manifest.py` — dependency-free AXML reader used to verify the APK

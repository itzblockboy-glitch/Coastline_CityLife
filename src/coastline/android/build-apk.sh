#!/usr/bin/env bash
set -euo pipefail
if [ -n "${JAVA_HOME:-}" ]; then export PATH="$JAVA_HOME/bin:$PATH"; elif [ -d /usr/lib/jvm/jdk-11/bin ]; then export PATH="/usr/lib/jvm/jdk-11/bin:$PATH"; fi
cd "$(dirname "$0")/.."
TOOLS="${ANDROID_BUILD_TOOLS:-$PWD/android-tools/android-11}"
if [ ! -d "$TOOLS" ] && [ -d "$HOME/.cache/coastline-sdk/android-11" ]; then TOOLS="$HOME/.cache/coastline-sdk/android-11"; fi
JAR="${ANDROID_JAR:-$PWD/android-tools/android.jar}"
if [ ! -f "$JAR" ] && [ -f "$HOME/.cache/coastline-sdk/android.jar" ]; then JAR="$HOME/.cache/coastline-sdk/android.jar"; fi
mkdir -p android/work/classes android/work/dex
rm -rf android/assets/www
mkdir -p android/assets/www
npm run bundle
cp public/{index.html,style.css,app.js,credits.html,v2-notes.html,v3-notes.html,v4-notes.html,v5-notes.html,third-party-licenses.txt} android/assets/www/
cp -r public/assets android/assets/www/
cp -r public/licenses android/assets/www/
"$TOOLS/aapt" package -f -M android/AndroidManifest.xml -S android/res -A android/assets -I "$JAR" -F android/work/unsigned.apk
javac -source 8 -target 8 -bootclasspath "$JAR:$TOOLS/core-lambda-stubs.jar" -d android/work/classes android/src/ai/arena/coastline/MainActivity.java
(cd android/work/classes && zip -q -r ../classes.jar .)
"$TOOLS/d8" --release --min-api 26 --lib "$JAR" --output android/work/dex android/work/classes.jar
(cd android/work/dex && zip -q -u ../unsigned.apk classes.dex)
"$TOOLS/zipalign" -f -p 4 android/work/unsigned.apk android/work/aligned.apk
KEY="${COASTLINE_KEYSTORE:-$HOME/.coastline-signing.keystore}"
ALIAS="${COASTLINE_KEY_ALIAS:-coastline}"
STOREPASS="${COASTLINE_KEYSTORE_PASS:-android}"
KEYPASS="${COASTLINE_KEY_PASS:-$STOREPASS}"
OUT="${APK_OUT:-/home/user/Coastline-CityLife-v1.5.apk}"
mkdir -p "$(dirname "$OUT")"
if [ ! -f "$KEY" ]; then keytool -genkeypair -keystore "$KEY" -alias "$ALIAS" -storepass "$STOREPASS" -keypass "$KEYPASS" -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Coastline Development, O=Coastline Prototype, C=IN'; fi
"$TOOLS/apksigner" sign --ks "$KEY" --ks-key-alias "$ALIAS" --ks-pass "pass:$STOREPASS" --key-pass "pass:$KEYPASS" --out "$OUT" android/work/aligned.apk
"$TOOLS/apksigner" verify --verbose "$OUT"
"$TOOLS/aapt" dump badging "$OUT" | sed -n '1,8p'
sha256sum "$OUT"

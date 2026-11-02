#!/usr/bin/env bash
# Fetches Android build-tools plus a platform android.jar into android-tools/.
# The platform jar needs API 33+ for the <application> game_mode_config meta-data attributes;
# if only an older jar can be downloaded, build-apk.sh drops that opt-in instead of failing.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p android-tools
if [ ! -d android-tools/android-11 ]; then
  curl -fL https://dl.google.com/android/repository/build-tools_r30.0.3-linux.zip -o android-tools/buildtools.zip
  unzip -q -o android-tools/buildtools.zip -d android-tools
  rm android-tools/buildtools.zip
fi

JAR=android-tools/android.jar
if [ -f "$JAR" ]; then
  echo "android.jar already present"
  exit 0
fi

# Prefer an official platform package so API 33+ attributes resolve.
for plat in platform-34_r03 platform-34_r02 platform-33_r03 platform-33_r02; do
  echo "trying $plat"
  if curl -fsL "https://dl.google.com/android/repository/${plat}.zip" -o android-tools/platform.zip 2>/dev/null; then
    if unzip -p android-tools/platform.zip "android-*/android.jar" > "$JAR" 2>/dev/null && [ -s "$JAR" ]; then
      rm -f android-tools/platform.zip
      echo "android.jar from ${plat}"
      exit 0
    fi
  fi
  rm -f android-tools/platform.zip
done

# Fallback: public mirror of the API 30 compile stubs (no game-mode attributes).
echo "falling back to API 30 stubs; game_mode_config will be omitted from the build"
curl -fL https://raw.githubusercontent.com/Sable/android-platforms/master/android-30/android.jar -o "$JAR"

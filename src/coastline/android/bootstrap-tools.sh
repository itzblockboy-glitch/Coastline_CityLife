#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p android-tools
curl -fL https://dl.google.com/android/repository/build-tools_r30.0.3-linux.zip -o android-tools/buildtools.zip
unzip -q -o android-tools/buildtools.zip -d android-tools
# Public mirror of Android API 30 compile stubs. You may instead set ANDROID_JAR to your official SDK's platforms/android-30/android.jar.
curl -fL https://raw.githubusercontent.com/Sable/android-platforms/master/android-30/android.jar -o android-tools/android.jar
rm android-tools/buildtools.zip

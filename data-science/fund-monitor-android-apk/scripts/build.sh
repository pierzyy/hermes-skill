#!/bin/bash
set -e
export ANDROID_HOME=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
BUILD_TOOLS=$ANDROID_HOME/build-tools/34.0.0
PLATFORM=$ANDROID_HOME/platforms/android-34
PROJECT=/opt/fund-monitor-apk
BUILD_DIR=$PROJECT/build

rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR/classes $BUILD_DIR/dex $BUILD_DIR/apk

echo "=== 1. Compile resources (aapt2) ==="
$BUILD_TOOLS/aapt2 compile -o $BUILD_DIR/res.zip --dir $PROJECT/app/src/main/res

$BUILD_TOOLS/aapt2 link $BUILD_DIR/res.zip \
  -o $BUILD_DIR/base.apk \
  -I $PLATFORM/android.jar \
  --manifest $PROJECT/app/src/main/AndroidManifest.xml \
  --java $BUILD_DIR/gen \
  -A $PROJECT/app/src/main/assets \
  --min-sdk-version 21 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0 --auto-add-overlay

echo "=== 2. Compile Java (javac) ==="
javac -source 11 -target 11 -cp $PLATFORM/android.jar \
  -d $BUILD_DIR/classes \
  $PROJECT/app/src/main/java/com/fundmonitor/app/MainActivity.java

echo "=== 3. Convert to DEX (d8) ==="
$BUILD_TOOLS/d8 --lib $PLATFORM/android.jar \
  --output $BUILD_DIR/dex $BUILD_DIR/classes/com/fundmonitor/app/*.class

echo "=== 4. Package APK ==="
cd $BUILD_DIR/dex && zip -q $BUILD_DIR/base.apk classes.dex && cd $PROJECT

echo "=== 5. Align (zipalign) ==="
$BUILD_TOOLS/zipalign -f 4 $BUILD_DIR/base.apk $BUILD_DIR/aligned.apk

echo "=== 6. Sign (apksigner) ==="
keytool -genkey -v -keystore $BUILD_DIR/debug.keystore -alias debug \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=Debug,O=FundMonitor,C=CN" 2>/dev/null || true

$BUILD_TOOLS/apksigner sign --ks $BUILD_DIR/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --out $BUILD_DIR/FundMonitor.apk $BUILD_DIR/aligned.apk

cp $BUILD_DIR/FundMonitor.apk /opt/data/fund_monitor_web/FundMonitor.apk
echo "=== DONE: /opt/data/fund_monitor_web/FundMonitor.apk ==="
ls -lh /opt/data/fund_monitor_web/FundMonitor.apk

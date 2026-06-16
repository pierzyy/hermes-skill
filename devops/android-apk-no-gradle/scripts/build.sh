#!/bin/bash
# Build FundMonitor APK using Android SDK command-line tools
# No Gradle required — pure aapt2 + javac + d8 + apksigner
set -e

SDK=/opt/android-sdk
BUILD_TOOLS=$SDK/build-tools/35.0.0
AAPT2=$SDK/build-tools/34.0.0/aapt2  # 34 generates traditional XML manifest, 35 generates proto
PLATFORM=$SDK/platforms/android-34
PROJ=/opt/data/fund_monitor_app/android
OUT=$PROJ/build
APK=$OUT/fundmonitor-unsigned.apk
SIGNED=$OUT/FundMonitor.apk

export ANDROID_SDK_ROOT=$SDK

# Generate keystore if not exists
KEYSTORE=$PROJ/debug.keystore
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkey -v -keystore "$KEYSTORE" -alias fundmonitor \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=FundMonitor, OU=Dev, O=Hermes, L=Shanghai, S=Shanghai, C=CN" 2>/dev/null
fi

rm -rf $OUT
mkdir -p $OUT/classes $OUT/dex $OUT/apk

# 1. Compile resources
echo "=== Step 1: aapt2 compile ==="
$AAPT2 compile --dir $PROJ/app/src/main/res -o $OUT/compiled-resources.zip

# 2. Link (NO --proto-format for compatibility)
echo "=== Step 2: aapt2 link ==="
$AAPT2 link \
  -I $PLATFORM/android.jar \
  --manifest $PROJ/app/src/main/AndroidManifest.xml \
  --java $OUT/ \
  -o $OUT/apk/base.apk \
  $OUT/compiled-resources.zip

# 3. Compile Java (--release 11 for d8 compatibility)
echo "=== Step 3: javac ==="
javac --release 11 -cp $PLATFORM/android.jar \
  -d $OUT/classes \
  $OUT/com/fundmonitor/app/R.java \
  $PROJ/app/src/main/java/com/fundmonitor/app/MainActivity.java

# 4. DEX (build-tools 35 required for JDK 21 compatibility)
echo "=== Step 4: d8 ==="
$BUILD_TOOLS/d8 --lib $PLATFORM/android.jar \
  --output $OUT/dex $OUT/classes/com/fundmonitor/app/*.class

# 5. Package
echo "=== Step 5: package APK ==="
mkdir -p $OUT/apk_unpacked
unzip -qo $OUT/apk/base.apk -d $OUT/apk_unpacked
cp $OUT/dex/classes.dex $OUT/apk_unpacked/
cp -r $PROJ/app/src/main/assets $OUT/apk_unpacked/
cd $OUT/apk_unpacked && zip -qr $APK . -x "*.apk" && cd - > /dev/null

# 6. Align
echo "=== Step 6: zipalign ==="
$BUILD_TOOLS/zipalign -f 4 $APK $OUT/fundmonitor-aligned.apk

# 7. Sign
echo "=== Step 7: apksigner ==="
$BUILD_TOOLS/apksigner sign \
  --ks $KEYSTORE --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 26 \
  --out $SIGNED $OUT/fundmonitor-aligned.apk

echo ""
echo "=== BUILD SUCCESS ==="
ls -lh $SIGNED

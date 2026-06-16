#!/bin/bash
# Build FundMonitor APK using Android SDK command-line tools
# ⚠️ aapt2 MUST be v34 (v35 proto-format breaks on real devices)
# ⚠️ d8/apksigner MUST be v35 (v34 d8 crashes on JDK 21)
set -e

SDK=/opt/android-sdk
BUILD_TOOLS=$SDK/build-tools/35.0.0
AAPT2=$SDK/build-tools/34.0.0/aapt2
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

# 1. Compile resources (aapt2 v34 — NO --proto-format!)
echo "=== Step 1: aapt2 compile ==="
$AAPT2 compile \
  --dir $PROJ/app/src/main/res \
  -o $OUT/compiled-resources.zip

# 2. Link resources
echo "=== Step 2: aapt2 link ==="
$AAPT2 link \
  -I $PLATFORM/android.jar \
  --manifest $PROJ/app/src/main/AndroidManifest.xml \
  --java $OUT/ \
  -o $OUT/apk/base.apk \
  $OUT/compiled-resources.zip

# 3. Compile Java (--release 11 for JDK 21 compat)
echo "=== Step 3: javac ==="
javac \
  --release 11 \
  -cp $PLATFORM/android.jar \
  -d $OUT/classes \
  $OUT/com/fundmonitor/app/R.java \
  $PROJ/app/src/main/java/com/fundmonitor/app/MainActivity.java

# 4. Convert to DEX (v35 handles JDK 21)
echo "=== Step 4: d8 ==="
$BUILD_TOOLS/d8 \
  --lib $PLATFORM/android.jar \
  --output $OUT/dex \
  $OUT/classes/com/fundmonitor/app/*.class

# 5. Package APK
echo "=== Step 5: Package ==="
mkdir -p $OUT/apk_unpacked
unzip -qo $OUT/apk/base.apk -d $OUT/apk_unpacked
cp $OUT/dex/classes.dex $OUT/apk_unpacked/
cp -r $PROJ/app/src/main/assets $OUT/apk_unpacked/
cd $OUT/apk_unpacked
zip -qr $APK . -x "*.apk"
cd - > /dev/null

# 6. Align
echo "=== Step 6: zipalign ==="
$BUILD_TOOLS/zipalign -f 4 $APK $OUT/fundmonitor-aligned.apk

# 7. Sign (--min-sdk-version required for binary manifest)
echo "=== Step 7: apksigner ==="
$BUILD_TOOLS/apksigner sign \
  --ks $KEYSTORE \
  --ks-pass pass:android \
  --key-pass pass:android \
  --min-sdk-version 26 \
  --out $SIGNED \
  $OUT/fundmonitor-aligned.apk

echo ""
echo "=== BUILD SUCCESS ==="
ls -lh $SIGNED
echo "APK: $SIGNED"

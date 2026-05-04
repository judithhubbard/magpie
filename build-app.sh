#!/bin/bash
#
# build-app.sh — build Magpie.app (macOS bundle) from this directory.
#
# Output:    ./Magpie.app          (drag to Applications)
#            ./Magpie.app.zip      (if --zip is passed; share this)
#
# Requires:  macOS, ImageMagick (`magick`), osacompile + iconutil (built-in).
#            Recipients need Python 3 (ships with macOS Command Line Tools or
#            via Xcode; macOS 10.15+ usually has it preinstalled).

set -euo pipefail
cd "$(dirname "$0")"

APP="Magpie.app"
APP_NAME="Magpie"
BUNDLE_ID="org.local.magpie"
VERSION="1.0"

if ! command -v magick >/dev/null 2>&1; then
  echo "error: ImageMagick (magick) not found. brew install imagemagick" >&2
  exit 1
fi

echo "→ cleaning old build"
rm -rf "$APP" "${APP}.zip"

echo "→ compiling AppleScript launcher → $APP"
# osacompile produces a proper Cocoa-backed .app. The -s flag makes it a
# "stay-open" applet — without -s the applet exits as soon as `on run`
# returns, so the Dock icon vanishes and a second double-click triggers a
# fresh (bouncing) launch instead of a `reopen` event.
osacompile -s -o "$APP" app/launcher.applescript

echo "→ overwriting Info.plist with our metadata"
# osacompile writes its own minimal Info.plist. We replace it with one that
# sets our bundle identifier, icon, version, and disables the Script Editor
# menu hook (LSUIElement = false keeps the Dock icon).
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>              <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>       <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>        <string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key>           <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key>        <string>applet</string>
  <key>CFBundleIconFile</key>          <string>magpie.icns</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>CFBundleSignature</key>         <string>aplt</string>
  <key>LSMinimumSystemVersion</key>    <string>10.15</string>
  <key>LSRequiresCarbon</key>          <true/>
  <key>NSHighResolutionCapable</key>   <true/>
  <key>OSAAppletStayOpen</key>         <true/>
  <key>WindowState</key>
  <dict>
    <key>positionOfDivider</key><real>0</real>
    <key>savedFrame</key><string></string>
    <key>selectedTabView</key><string>result</string>
  </dict>
  <key>NSHumanReadableCopyright</key>  <string>Magpie — bird silhouette adapted from photo by Wikimedia user Grungaloo (CC-BY-SA 4.0)</string>
</dict>
</plist>
EOF

echo "→ copying web files and Python helper into bundle"
mkdir -p "$APP/Contents/Resources/web"
cp index.html style.css manifest.json icon.svg "$APP/Contents/Resources/web/"
cp icon-*.png "$APP/Contents/Resources/web/" 2>/dev/null || true
cp -R js "$APP/Contents/Resources/web/"
cp app/start_server.py "$APP/Contents/Resources/start_server.py"
chmod +x "$APP/Contents/Resources/start_server.py"

echo "→ generating .icns"
ICONSET="$(mktemp -d)/magpie.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  D=$((SIZE*2))
  # -background none MUST come before the input file, or ImageMagick rasterizes
  # the SVG onto a white canvas and the rounded-corner outsides become opaque.
  magick -background none icon.svg -resize ${SIZE}x${SIZE} "$ICONSET/icon_${SIZE}x${SIZE}.png"
  magick -background none icon.svg -resize ${D}x${D}       "$ICONSET/icon_${SIZE}x${SIZE}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/magpie.icns"
rm -rf "$(dirname "$ICONSET")"
# osacompile creates its own placeholder icon — remove it.
rm -f "$APP/Contents/Resources/applet.icns"

# We modified Info.plist and Resources/ after osacompile signed the bundle,
# which invalidates the original signature. Re-sign ad-hoc so the launch
# services activation handshake works (an invalid signature can cause the
# Dock to bounce indefinitely on a second launch).
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

# Strip macOS quarantine attributes so the app launches without an extra
# Gatekeeper hop on the build machine. (Recipients still hit Gatekeeper the
# first time — they need to right-click → Open → Open the first time.)
xattr -cr "$APP" 2>/dev/null || true

# Touch the bundle so Finder picks up the new icon next time it's viewed.
touch "$APP"

echo "✓ built $APP"

if [[ "${1:-}" == "--zip" ]]; then
  echo "→ zipping for sharing"
  ditto -c -k --sequesterRsrc --keepParent "$APP" "${APP}.zip"
  echo "✓ wrote ${APP}.zip ($(du -h "${APP}.zip" | cut -f1))"
fi

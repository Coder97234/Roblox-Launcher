#!/usr/bin/env bash
# Build Xenity as a single-file AppImage.
#
#   npm run appimage
#
# The build happens in a scratch copy (.appimage/), so the working checkout and
# its node_modules are never touched. Electron supplies the window and its own
# Node runtime, so the finished AppImage needs nothing installed on the machine
# beyond what a desktop already has. The Cordial engine is not baked in: the
# launcher downloads it on demand into its own data directory (see
# server/modules/engine_manager.js).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64 | aarch64) ;;
  *)
    echo "Unsupported architecture: $ARCH (x86_64 and aarch64 are published)" >&2
    exit 1
    ;;
esac

WORK="$ROOT/.appimage"
SRC="$WORK/src"
APPDIR="$WORK/AppDir"
OUT="$ROOT/release"
APPBIN="$APPDIR/usr/lib/xenity"

echo "== 1/6  copying the checkout into $SRC"
rm -rf "$WORK"
mkdir -p "$SRC" "$APPDIR" "$OUT"
tar -C "$ROOT" \
  --exclude=./node_modules \
  --exclude=./release \
  --exclude=./.appimage \
  --exclude=./.git \
  --exclude=./data \
  -cf - . | tar -C "$SRC" -xf -

echo "== 2/6  building the interface"
cd "$SRC"
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev

echo "== 3/6  fetching Electron"
mkdir -p "$WORK/electron"
cd "$WORK/electron"
printf '{"name":"xenity-electron-host","private":true}\n' > package.json
npm install --no-audit --no-fund --no-save electron@latest
ELECTRON_VERSION="$(node -p "require('$WORK/electron/node_modules/electron/package.json').version")"
ELECTRON_DIST="$WORK/electron/node_modules/electron/dist"
if [ ! -x "$ELECTRON_DIST/electron" ]; then
  echo "   npm skipped Electron's binary; fetching it directly"
  node node_modules/electron/install.js
fi
if [ ! -x "$ELECTRON_DIST/electron" ]; then
  echo "Electron's binary is missing at $ELECTRON_DIST" >&2
  exit 1
fi

echo "== 4/6  assembling the AppDir"
mkdir -p "$APPBIN/resources/app" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/icons/hicolor/scalable/apps"
cp -a "$ELECTRON_DIST/." "$APPBIN/"
mv "$APPBIN/electron" "$APPBIN/xenity"
rm -f "$APPBIN/resources/default_app.asar"

cp -a "$SRC/dist" "$APPBIN/resources/app/dist"
cp -a "$SRC/server" "$APPBIN/resources/app/server"
cp -a "$SRC/node_modules" "$APPBIN/resources/app/node_modules"
cp "$ROOT/packaging/electron/main.cjs" "$APPBIN/resources/app/main.cjs"
cp "$ROOT/packaging/electron/package.json" "$APPBIN/resources/app/package.json"
node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.version = process.argv[2];
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
' "$APPBIN/resources/app/package.json" "$VERSION"

install -m 755 "$ROOT/packaging/appimage/AppRun" "$APPDIR/AppRun"
install -m 644 "$ROOT/packaging/appimage/xenity.desktop" "$APPDIR/usr/share/applications/xenity.desktop"
install -m 644 "$ROOT/packaging/appimage/xenity.desktop" "$APPDIR/xenity.desktop"
install -m 644 "$ROOT/packaging/appimage/xenity.svg" "$APPDIR/usr/share/icons/hicolor/scalable/apps/xenity.svg"
install -m 644 "$ROOT/packaging/appimage/xenity.svg" "$APPDIR/xenity.svg"
ln -sf xenity.svg "$APPDIR/.DirIcon"

echo "== 5/6  fetching appimagetool"
TOOL="$WORK/appimagetool.AppImage"
curl -fsSL -o "$TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
chmod +x "$TOOL"

echo "== 6/6  packaging the AppImage"
TARGET="$OUT/Xenity-${VERSION}-${ARCH}.AppImage"
rm -f "$TARGET"
ARCH="$ARCH" APPIMAGE_EXTRACT_AND_RUN=1 "$TOOL" "$APPDIR" "$TARGET"
chmod +x "$TARGET"
( cd "$OUT" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256" )

echo
echo "Built  $TARGET"
echo "Shell  Electron $ELECTRON_VERSION"
echo "Engine Cordial is downloaded on first install, not baked in."
echo "Run    chmod +x '$TARGET' && '$TARGET'"

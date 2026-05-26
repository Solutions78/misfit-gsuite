#!/usr/bin/env bash
set -euo pipefail

INPUT_DMG="${1:-}"
OUTPUT_DMG="${2:-release/Misfit-GSuite-Team-0.1.0-aarch64.dmg}"

if [[ -z "$INPUT_DMG" ]]; then
  INPUT_DMG=$(find src-tauri/target/release/bundle/dmg -maxdepth 1 -type f -name '*.dmg' -print0 \
    | xargs -0 ls -t 2>/dev/null \
    | head -n 1 || true)
fi

if [[ -z "$INPUT_DMG" || ! -f "$INPUT_DMG" ]]; then
  echo "No source DMG found. Run: npm run tauri build" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_DMG")"

TMP_DIR=$(mktemp -d /tmp/misfit-gsuite-dmg.XXXXXX)
RW_BASE="$TMP_DIR/team-rw"
RW_DMG="$RW_BASE.dmg"
FIXED_DMG="$TMP_DIR/team-fixed.dmg"
MOUNT_DIR="$TMP_DIR/mount"
mkdir -p "$MOUNT_DIR"

cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

hdiutil convert "$INPUT_DMG" -format UDRW -o "$RW_BASE" -quiet
hdiutil attach "$RW_DMG" -readwrite -nobrowse -mountpoint "$MOUNT_DIR" -quiet

# Tauri/create-dmg adds this as the custom volume icon. If Finder hidden files
# are visible, it appears as a second app icon named VolumeIcon.icns. Remove it
# so the team DMG contains only the app and the Applications symlink.
rm -f "$MOUNT_DIR/.VolumeIcon.icns" "$MOUNT_DIR/VolumeIcon.icns"
if command -v SetFile >/dev/null 2>&1; then
  SetFile -a c "$MOUNT_DIR" 2>/dev/null || true
fi
sync
hdiutil detach "$MOUNT_DIR" -quiet

hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$FIXED_DMG" -quiet
cp "$FIXED_DMG" "$OUTPUT_DMG"

# Verify the fixed image does not contain the artifact.
hdiutil attach "$OUTPUT_DMG" -readonly -nobrowse -mountpoint "$MOUNT_DIR" -quiet
if [[ -e "$MOUNT_DIR/.VolumeIcon.icns" || -e "$MOUNT_DIR/VolumeIcon.icns" ]]; then
  echo "VolumeIcon artifact still exists in $OUTPUT_DMG" >&2
  exit 1
fi
hdiutil detach "$MOUNT_DIR" -quiet

hdiutil verify "$OUTPUT_DMG" >/dev/null
shasum -a 256 "$OUTPUT_DMG"

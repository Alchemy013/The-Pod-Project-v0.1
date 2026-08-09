#!/usr/bin/env bash
# Build ThePod (Release) and install it on the connected iPhone.
#
# Exists because `npx expo run:ios` hangs against Xcode 26.6 — see the Deploy
# section of docs/PROJECT_STATUS.md. This drives xcodebuild and devicectl
# directly, which works.
#
# The install is signed with a FREE personal team, so it expires after 7 days.
# Re-running this script is the whole maintenance story; it prints the new
# expiry at the end.
#
# Usage:  ./scripts/install-ios.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Finding the device"
# Two different identifiers for the same phone, and they are not interchangeable:
# xcodebuild wants the classic UDID, devicectl wants the CoreDevice UUID.
# Match on "iPhone" specifically, not just "not a simulator": the Devices block
# also lists this Mac and any paired Apple Watch, and the Watch sorts first —
# which silently yields a Watch UDID and a build destined for nothing.
UDID=$(xcrun xctrace list devices 2>/dev/null \
  | sed -n '/^== Devices ==/,/^== Simulators ==/p' \
  | grep -i "iphone" \
  | grep -oE '\(0000[0-9A-F]{4}-[0-9A-F]{16}\)' | tr -d '()' | head -1)

CORE_UUID=$(xcrun devicectl list devices 2>/dev/null \
  | awk '$0 ~ /physical/ && $0 !~ /Watch/ { for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{4}-/) { print $i; exit } }')

if [ -z "$UDID" ] || [ -z "$CORE_UUID" ]; then
  echo "No iPhone found. Plug it in (or check it's on the same Wi-Fi and trusted), then retry." >&2
  echo "  xctrace  UDID: '${UDID:-<none>}'" >&2
  echo "  devicectl UUID: '${CORE_UUID:-<none>}'" >&2
  exit 1
fi
echo "    UDID       $UDID"
echo "    CoreDevice $CORE_UUID"

echo "==> Building (Release — this takes ~15 min cold)"
xcodebuild -workspace ios/ThePod.xcworkspace -scheme ThePod \
  -configuration Release -destination "id=$UDID" \
  -allowProvisioningUpdates build

APP=$(find ~/Library/Developer/Xcode/DerivedData/ThePod-*/Build/Products/Release-iphoneos \
  -maxdepth 1 -name 'ThePod.app' 2>/dev/null | head -1)
[ -n "$APP" ] || { echo "Built, but no ThePod.app found in DerivedData." >&2; exit 1; }

# A stale or missing bundle means the phone runs OLD JS off a fresh binary,
# which is indistinguishable from "my changes didn't apply". Fail loudly.
[ -f "$APP/main.jsbundle" ] || { echo "No embedded main.jsbundle — the app would need Metro." >&2; exit 1; }
echo "==> Bundle: $(du -h "$APP/main.jsbundle" | cut -f1), built $(date -r "$APP/main.jsbundle" '+%H:%M')"

echo "==> Installing"
xcrun devicectl device install app --device "$CORE_UUID" "$APP"

EXPIRY=$(security cms -D -i "$APP/embedded.mobileprovision" 2>/dev/null \
  | plutil -extract ExpirationDate xml1 -o - - 2>/dev/null \
  | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
echo
echo "Installed. Free-team signing expires ${EXPIRY:-unknown} — re-run this script to reset the week."

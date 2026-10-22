#!/bin/sh
# Convyy MCP installer for macOS: uses the Node.js already on this computer, or downloads the official one once.
#
#   ./install.sh --client <codex|claude|open-webui>          install
#   ./install.sh --client claude --dry-run                    show what would change, write nothing
#   ./install.sh status                                       is it installed and working
#
# With Node.js 20 or newer on this computer this only starts app/installer.js. Without it, the official
# Node.js v24.22.0 is downloaded from nodejs.org, its SHA-256 is checked against the value pinned below (from the
# official SHASUMS256.txt) and it is kept in your user folder, so it is never downloaded twice. Nothing is installed
# system-wide and no administrator rights are used.
set -eu

MIN_MAJOR=20
NODE_VERSION=v24.22.0
BASE_URL=https://nodejs.org/dist

here=$(cd "$(dirname "$0")" && pwd)
installer="$here/app/installer.js"
if [ ! -f "$installer" ]; then
  echo "app/installer.js was not found next to install.sh." >&2
  exit 1
fi

# `./install.sh --client claude` means `install --client claude`.
case "${1:-}" in
  --*|"") set -- install "$@" ;;
esac

if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -ge "$MIN_MAJOR" ] 2>/dev/null; then
    exec node "$installer" "$@"
  fi
fi

[ "$(uname -s)" = "Darwin" ] || { echo "This script is for macOS. On other systems install Node.js $MIN_MAJOR or newer from https://nodejs.org and run: node app/installer.js install --client <codex|claude|open-webui>" >&2; exit 1; }
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  platform=darwin-arm64
  sha256=6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5
else
  platform=darwin-x64
  sha256=495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91
fi
top="node-$NODE_VERSION-$platform"
file="$top.tar.gz"

case "${CONVYY_MCP_STATE_DIR:-}" in
  /*) state=$CONVYY_MCP_STATE_DIR ;;
  *) state="$HOME/Library/Application Support/Convyy/mcp" ;;
esac
target="$state/install/node/$NODE_VERSION"

if [ -x "$target/node" ] && [ "$("$target/node" --version 2>/dev/null || true)" = "$NODE_VERSION" ]; then
  exec "$target/node" "$installer" "$@"
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/convyy-node.XXXXXX")
cleanup() { rm -rf "$tmp" "$target.part.$$"; }
trap cleanup EXIT INT TERM

echo "No Node.js $MIN_MAJOR or newer found. Downloading the official Node.js $NODE_VERSION once ($BASE_URL/$NODE_VERSION/$file) ..." >&2
curl -fL --proto '=https' --tlsv1.2 -o "$tmp/$file" "$BASE_URL/$NODE_VERSION/$file"
actual=$(shasum -a 256 "$tmp/$file" | cut -d ' ' -f 1)
if [ "$actual" != "$sha256" ]; then
  echo "The downloaded $file does not match the pinned SHA-256 (expected $sha256, got $actual). It was discarded." >&2
  exit 1
fi
tar -xzf "$tmp/$file" -C "$tmp" "$top/bin/node" "$top/LICENSE"
(umask 077; mkdir -p "$state/install/node")
mkdir -p "$target.part.$$"
mv "$tmp/$top/bin/node" "$target.part.$$/node"
mv "$tmp/$top/LICENSE" "$target.part.$$/LICENSE"
chmod 755 "$target.part.$$/node"
if [ "$("$target.part.$$/node" --version)" != "$NODE_VERSION" ]; then
  echo "The unpacked Node.js does not report $NODE_VERSION." >&2
  exit 1
fi
rm -rf "$target"
mv "$target.part.$$" "$target"
echo "Node.js $NODE_VERSION is in $target; later installs reuse it." >&2

# `exec` would skip the cleanup trap, but everything left in $tmp is disposable: remove it first.
rm -rf "$tmp"
trap - EXIT INT TERM
exec "$target/node" "$installer" "$@"

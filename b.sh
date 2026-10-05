#!/usr/bin/env bash
# Package and install the IOrg VS Code extension.
set -euo pipefail
cd "$(dirname "$0")"

npx vsce package
code --install-extension iorg-2.0.0-SNAPSHOT.vsix --force

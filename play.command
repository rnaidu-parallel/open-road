#!/bin/zsh
set -e
cd "${0:A:h}"
# Load an installed Node 22 runtime when the macOS GUI shell uses an older Node.
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 22 >/dev/null
fi
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run dev -- --open

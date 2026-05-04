#!/bin/bash
set -euo pipefail

if [ ! -d node_modules ]; then
  echo "Missing frontend dependencies in react/node_modules"
  echo "Run: npm install --legacy-peer-deps"
  exit 1
fi

npm exec vite build

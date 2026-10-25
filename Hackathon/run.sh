#!/usr/bin/env bash
# ==============================================================================
# TLB & Page Table Simulator - Ubuntu Launch Script
# ==============================================================================

set -e

echo -e "\033[1;33m[Ubuntu OSSP Hackathon]\033[0m Starting TLB & Page Table Simulator..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "\033[1;31m[Error]\033[0m Node.js is not installed."
    echo -e "Install Node.js 18+ on Ubuntu using:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    exit 1
fi

echo -e "\033[1;32m[OK]\033[0m Node.js version: $(node -v)"
echo -e "\033[1;32m[OK]\033[0m npm version: $(npm -v)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "\033[1;34m[Info]\033[0m Installing project dependencies..."
    npm install
fi

# Launch Vite Dev Server
echo -e "\033[1;32m[Ready]\033[0m Launching Ubuntu Web Simulator at http://localhost:5173..."
npm run dev -- --host --port 5173

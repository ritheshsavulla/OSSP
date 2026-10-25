#!/usr/bin/env bash

# ==============================================================================
# Linux Memory-Mapped File Management System
# Operating Systems and System Programming (OSSP) Project
# Startup & Launcher Script
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "======================================================================"
echo "   Linux Memory-Mapped File Management System Launcher               "
echo "   OSSP Lab Project | POSIX / Linux System Calls & Web Interface     "
echo "======================================================================"

# Step 1: Check GCC compiler
if ! command -v gcc &> /dev/null; then
    echo "[-] Error: GCC is not installed."
    echo "[!] Please run: sudo apt update && sudo apt install -y gcc make"
    exit 1
fi
echo "[+] GCC detected: $(gcc --version | head -n 1)"

# Step 2: Check Make utility
if ! command -v make &> /dev/null; then
    echo "[-] Error: GNU Make is not installed."
    echo "[!] Please run: sudo apt update && sudo apt install -y make"
    exit 1
fi
echo "[+] Make detected: $(make --version | head -n 1)"

# Step 3: Ensure data/ directory exists
if [ ! -d "data" ]; then
    echo "[*] Creating data directory: data/"
    mkdir -p data
else
    echo "[+] Data directory verified: data/"
fi

# Step 4: Ensure web directory exists
if [ ! -d "web" ]; then
    echo "[-] Warning: web/ directory not found. Please ensure web assets exist."
fi

# Step 5: Compile if binary is missing or source files are newer
if [ ! -f "memory_server" ] || [ "server.c" -nt "memory_server" ] || [ "memory_manager.c" -nt "memory_server" ]; then
    echo "[*] Compiling project with Makefile..."
    make
else
    echo "[+] Existing binary ./memory_server is up to date."
fi

PORT=8080
URL="http://localhost:${PORT}"

echo ""
echo "[*] Starting Memory-Mapped File Server on port ${PORT}..."
echo "[*] Dashboard URL: ${URL}"
echo ""

# Function to attempt opening browser after server starts
open_browser() {
    sleep 1
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL" &> /dev/null &
    elif command -v wslview &> /dev/null; then
        wslview "$URL" &> /dev/null &
    elif command -v powershell.exe &> /dev/null; then
        powershell.exe /c start "$URL" &> /dev/null &
    elif command -v gnome-open &> /dev/null; then
        gnome-open "$URL" &> /dev/null &
    else
        echo "[!] Notice: Please open your browser manually and visit: ${URL}"
    fi
}

# Run open_browser in background
open_browser &

# Step 6: Start HTTP Server (Foreground)
exec ./memory_server "$PORT"

# 🖥️ TLB & Page Table Architecture Simulator

An interactive, high-fidelity Operating Systems memory management simulator styled with an authentic **Ubuntu 24.04 LTS Web Desktop Environment**. Built for the **OSSP Hackathon**.

![Ubuntu Web TLB Simulator](https://raw.githubusercontent.com/canonical/yaru/master/README.md)

---

## 🚀 Quick Start on Ubuntu (Native / WSL2 / VM)

### 1. Install Node.js (Version 18+ or 20+ Recommended)
On Ubuntu / Debian:
```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node -v   # e.g., v20.x or v24.x
npm -v    # e.g., 10.x or 11.x
```

---

### 2. Run the Simulator

#### Method A: Using the Automated Script
Make the script executable and run:
```bash
chmod +x run.sh
./run.sh
```

#### Method B: Standard npm Commands
```bash
# 1. Install dependencies
npm install

# 2. Launch Vite development server with network access
npm run dev -- --host
```

---

### 3. Open in Browser
Open your favorite web browser (Firefox, Chrome, Brave, Edge):
- **Local Machine:** [`http://localhost:5173`](http://localhost:5173)
- **From Windows using WSL2:** [`http://localhost:5173`](http://localhost:5173)
- **Remote Ubuntu Server:** `http://<your-server-ip>:5173`

---

## 🌟 Key Features & Architectural Highlights

### 1. Ubuntu 24.04 LTS Web Desktop
- **Authentic Yaru Design System:** Aubergine, Graphite, and Ubuntu Orange dark theme with glassmorphism.
- **Top GNOME Panel:** Interactive Clock with calendar popup, sound FX mute toggle, and system indicators.
- **Left Dock / Launcher:** Fast window access with running app indicators and tooltips.
- **Draggable & Resizable Windows:** Multi-tasking workspace with close, minimize, and maximize controls.

### 2. Comprehensive OS Memory Architecture
- **Address Decomposition:** Flexible 16-bit / 32-bit addresses, configurable page sizes (256 B to 4 KB), and bit breakdown (VPN, P1, P2, Offset).
- **Translation Lookaside Buffer (TLB):**
  - Fully Associative (CAM) and 2-Way / 4-Way Set Associative.
  - Replacement Policies: **LRU**, **FIFO**, **Clock (Second Chance)**, **LFU**, and **Random**.
  - TLB Shootdown / Invalidation on victim page eviction.
- **Page Table Architectures:**
  - **Single-Level Paging:** Direct VPN-to-Frame array with Present, Dirty, Referenced, and Swap metadata.
  - **Two-Level Hierarchical Paging:** Page Directory (P1) pointing to on-demand allocated Inner Tables (P2).
  - **Inverted Page Table:** 1 entry per physical frame, indexed by `(PID, VPN)`.
- **Physical RAM & Secondary Swap Disk:**
  - Frame status tiles, dirty page detection, and automated Swap writeback on page eviction.
  - Page Replacement Policies: **LRU**, **FIFO**, **Clock**, **Belady's Optimal (MIN)**, and **Random**.
- **Interactive Effective Access Time (EAT) Engine:**
  - Real-time empirical access time calculation.
  - Theoretical formula modeling with sensitivity sliders.
- **Ubuntu Bash Terminal (`ubuntu@ossp-hackathon:~$`):**
  - Built-in commands: `translate <addr> [R|W]`, `tlb`, `tlb --flush`, `ptable`, `meminfo`, `eat`, `run <preset>`, `config`, `top`, `clear`.
  - Tab autocomplete and history navigation (Up / Down arrows).
- **Workload Studio:**
  - 1-click presets: *Temporal Locality*, *Spatial Locality (Array Scan)*, *Matrix Col-Major Stride*, *Memory Thrashing*, *Multi-Process (PID 1 & 2)*.
  - Custom memory trace editor with text file import/export.
- **Acoustic Feedback:**
  - Synthesized Web Audio API sound effects for TLB hits, misses, page faults, and step clicks.

---

## 🛠️ Production Build (Optional)

To bundle the application into static HTML/CSS/JS for hosting on Nginx or Apache:
```bash
npm run build
npm run preview
```
The static bundle will be generated inside the `dist/` directory.

---

## 📜 License
Developed for Open Source Software Projects (OSSP) Hackathon. MIT License.

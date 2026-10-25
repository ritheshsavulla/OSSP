# Linux Memory-Mapped File Management System
### Operating Systems and System Programming (OSSP) Final Project

[![Platform](https://img.shields.io/badge/Platform-Ubuntu%20Linux%20%7C%20POSIX-orange.svg)](https://ubuntu.com)
[![Language](https://img.shields.io/badge/Language-C11%20%2F%20POSIX%20Sockets-blue.svg)](https://en.wikipedia.org/wiki/C_(programming_language))
[![Kernel API](https://img.shields.io/badge/System%20Calls-mmap%20%7C%20munmap%20%7C%20msync%20%7C%20fstat-green.svg)](https://man7.org/linux/man-pages/man2/mmap.2.html)
[![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-purple.svg)]()
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)]()

A high-performance Linux system programming project demonstrating real **memory-mapped file I/O** via the `mmap()`, `munmap()`, and `msync()` kernel system calls, exposed through a lightweight multithreaded pure C HTTP server and visualized with an interactive dark-terminal web dashboard.

---

## 🌟 Key Highlights & OS Concepts

- **True Linux Kernel `mmap()` Implementation**: No simulation. Files are mapped directly into the 64-bit user process virtual address space.
- **Zero-Copy Architecture**: Reads and writes occur through direct memory pointer dereferencing (`memcpy` / pointer arithmetic) with zero `read()` or `write()` system call overhead during mapped operations.
- **Dirty Page Tracking & Cache Coherency**: Visualizes physical RAM page cache dirty bit states and uses `msync(MS_SYNC)` to flush pages to block storage.
- **Physical RAM Residency Inspection (`mincore()`)**: Queries the Linux kernel to determine whether virtual memory pages are currently resident in physical RAM.
- **Zero External Backend Dependencies**: Pure C implementation using standard POSIX sockets (`sys/socket.h`, `pthread.h`). No Node.js, Python, or external frameworks required.
- **Strict Path Traversal Protection**: Enforces security validations preventing directory traversal (`../`, `/etc/passwd`, `/etc/shadow`).

---

## 📁 Project Directory Structure

```
Linux_Memory_Mapped_File_Management_System/
│
├── server.c                  # Multithreaded POSIX HTTP server & routing engine
├── memory_manager.c          # Core memory-mapped file engine & syscall implementations
├── memory_manager.h          # Data structures, mappings table & function prototypes
├── Makefile                  # Automated build configuration (gcc -O2 -pthread)
├── start.sh                  # All-in-one launcher script with dependency checking
├── test_suite.sh             # Automated 15-point API & syscall verification script
├── README.md                 # Project documentation, quickstart & viva guide
├── REPORT.md                 # Academic project report (19 formal sections)
│
├── data/                     # Secure sandbox directory for managed files
│
└── web/                      # Modern dark-terminal frontend dashboard
    ├── index.html            # UI layout, interactive visualizer & modals
    ├── style.css             # Cyberpunk/terminal design system & animations
    └── script.js             # Async REST API client & pipeline animator
```

---

## 🚀 Quickstart Guide (Ubuntu Linux)

### 1. Prerequisites Installation
Open your terminal on Ubuntu (native or WSL) and install the standard GNU C build tools:

```bash
sudo apt update
sudo apt install -y gcc make
```

### 2. Automated Run (Recommended)
Navigate to the project folder, grant execution permissions to `start.sh`, and run it:

```bash
cd Linux_Memory_Mapped_File_Management_System
chmod +x start.sh
./start.sh
```

`start.sh` automatically checks GCC, creates `./data/`, compiles the binary if needed, starts the HTTP server on port **8080**, and opens your default browser at:

👉 **`http://localhost:8080`**

---

### 3. Manual Compilation & Execution
If you prefer running manual commands step-by-step:

```bash
# Compile the project
make

# Launch the server on port 8080
./memory_server 8080
```

To clean up compiled binaries and object files:
```bash
make clean
```

---

## 🎓 Demonstrating for College Viva / Presentation

To deliver an outstanding OSSP practical demonstration, use the built-in **"🚀 Viva Demo Mode"** button in the top navigation bar, or follow this manual 13-step workflow:

### Step-by-Step Live Demo Workflow

| Step | Action in UI | Linux System Call Triggered | What to Explain to the Examiner |
| :---: | :--- | :--- | :--- |
| **1** | Click **+ New File** | `open(O_CREAT\|O_RDWR)`, `write()`, `close()` | Standard file creation allocating an Inode and directory entry in `./data/`. |
| **2** | Enter `test.txt` and text: `"Hello from Linux mmap!"` | `write()` | Initial data written to disk block storage. |
| **3** | Click **⚡ mmap() Map** | `open(O_RDWR)`, `fstat()`, `mmap()` | **Key Concept**: File is mapped into the process virtual address space. Show the pointer address (e.g., `0x7dca9d1d3000`) and explain demand paging. |
| **4** | Click **📖 read() / PTR** | Direct pointer dereference | Data is read directly from virtual memory without context switching to kernel space (**Zero-Copy**). |
| **5** | Switch to **Memory Buffer Editor** and modify text | Direct pointer access | Modify buffer to: `"Hello from Linux mmap! [Modified in Memory]"` and click **Commit Changes**. |
| **6** | Observe Dirty Badge | Page Table Dirty Bit | Show the amber `DIRTY` badge. Explain that modified bytes reside in physical RAM (Page Cache) and are not yet committed to disk. |
| **7** | Click **💾 msync() Flush** | `msync(addr, len, MS_SYNC)` | The Linux kernel flushes dirty pages from RAM back to block storage. Badge transitions to `CLEAN`. |
| **8** | Inspect **Virtual Memory Address** | `fstat()`, `mincore()` | Point out the base pointer, virtual range, and resident page count in the Inode Telemetry tab. |
| **9** | Click **📏 ftruncate() Resize** | `munmap()`, `ftruncate()`, `mmap()` | Explain why resizing a mapped file requires unmapping, calling `ftruncate()` to adjust file boundary, and remapping to prevent `SIGBUS`. |
| **10** | Click **❌ munmap() Unmap** | `msync()`, `munmap()`, `close()` | Releases the Virtual Memory Area (VMA) and closes the file descriptor. Address resets. |
| **11** | Click **📖 read() / PTR** again | Traditional `open()`, `read()`, `close()` | Demonstrates that modifications persisted on disk even after the mapping was unmapped. |
| **12** | Test Path Traversal | Filename security check | Try creating `../../etc/shadow` to demonstrate strict defense against directory traversal attacks. |
| **13** | Click **🗑 Delete File** | `unlink()` | Removes the directory entry from the filesystem. |

---

## 📡 REST API Reference

The backend provides a pure C REST API listening on port **8080**:

| Endpoint | Method | Payload / Query | Description | Underlying System Calls |
| :--- | :---: | :--- | :--- | :--- |
| `/api/files` | `GET` | None | Returns JSON array of all files in `./data/` and active mapping states | `opendir`, `readdir`, `stat`, `closedir` |
| `/api/stats` | `GET` | None | System page size, active maps count, total mapped bytes | `sysconf(_SC_PAGESIZE)` |
| `/api/info` | `GET` | `?file=<filename>` | Inode metadata, page count, and physical RAM residency | `stat`, `fstat`, `mincore` |
| `/api/create` | `POST` | `{"filename":"...","size":0,"content":"..."}` | Creates a new file in `./data/` | `open`, `write`, `ftruncate`, `close` |
| `/api/map` | `POST` | `{"filename":"...","prot":"rw","flags":"shared"}` | Maps file into process virtual address space | `open`, `fstat`, `mmap` |
| `/api/read` | `POST` | `{"filename":"...","offset":0,"length":0}` | Reads bytes via mapped memory pointer or `read()` | Pointer deref / `open`, `read`, `close` |
| `/api/write` | `POST` | `{"filename":"...","offset":0,"content":"..."}` | Writes data into memory pointer or `write()` | `memcpy` / `open`, `write`, `close` |
| `/api/resize` | `POST` | `{"filename":"...","new_size":1024}` | Adjusts file length using `ftruncate()` and updates map | `munmap`, `ftruncate`, `mmap` |
| `/api/sync` | `POST` | `{"filename":"...","async":false}` | Flushes dirty virtual memory pages to physical disk | `msync(MS_SYNC)` |
| `/api/unmap` | `POST` | `{"filename":"..."}` | Releases virtual memory region and closes fd | `msync`, `munmap`, `close` |
| `/api/delete` | `POST` | `{"filename":"..."}` | Unmaps if active and deletes file from disk | `munmap`, `unlink` |

---

## ⚙️ Architecture & Technical Flow

```
+----------------------------------------------------------------------------+
|                          Web Browser Frontend                              |
|          (HTML5 / Cyberpunk CSS3 / Vanilla JavaScript REST Client)         |
+----------------------------------------------------------------------------+
                                     │  ▲
              HTTP Requests (JSON)   │  │  HTTP Responses (JSON)
                                     ▼  │
+----------------------------------------------------------------------------+
|                  Pure C Multithreaded HTTP Server                          |
|         (POSIX Sockets on port 8080, pthread-per-connection)               |
+----------------------------------------------------------------------------+
                                     │
                                     ▼
+----------------------------------------------------------------------------+
|                       Memory Manager Core Engine                           |
|       (Tracks active MappedFileEntry structs, mutex synchronization)       |
+----------------------------------------------------------------------------+
      │                                                │
      │ 1. Traditional System Call Path                │ 2. Memory-Mapped Path
      ▼                                                ▼
+-----------------------------+               +------------------------------+
| open(), lseek(), read()     |               | mmap() System Call           |
| write(), close()            |               +------------------------------+
+-----------------------------+                                │
      │                                                        ▼
      ▼ (Double-Copy Buffer)                  +------------------------------+
+-----------------------------+               | Virtual Memory Address Space |
| Kernel Space Page Cache     |               | (Pointer: 0x7dca9d1d3000)    |
+-----------------------------+               +------------------------------+
      │                                                        │
      ▼                                                        ▼ Direct Pointer Access
+-----------------------------+               +------------------------------+
| User Space Buffer (Copy)    |               | Application (memcpy / PTR)   |
+-----------------------------+               +------------------------------+
                                                               │
                                                               ▼
                                              +------------------------------+
                                              | msync(MS_SYNC) Flush         |
                                              +------------------------------+
                                                               │
                                                               ▼
+----------------------------------------------------------------------------+
|                        Physical Disk / Storage File                        |
|                                 (ext4 / VFS)                               |
+----------------------------------------------------------------------------+
```

---

## 🧪 Automated Test Suite

The project includes an automated test script (`test_suite.sh`) verifying all 15 system call operations and security controls:

```bash
chmod +x test_suite.sh
./test_suite.sh
```

Expected output:
```text
--- 1. Testing GET / (Static Serving) --- HTTP/1.1 200 OK
--- 2. Testing GET /style.css --- HTTP/1.1 200 OK
--- 3. Testing GET /script.js --- HTTP/1.1 200 OK
--- 4. Testing GET /api/files --- {"success":true,"files":[]}
--- 5. Testing POST /api/create (test.txt) --- {"success":true,...}
--- 6. Testing POST /api/map (mmap syscall) --- {"success":true,"mapped_address":"0x7...",...}
--- 7. Testing POST /api/read (Direct Pointer Read) --- {"success":true,"method":"mmap_direct_pointer_access",...}
--- 8. Testing POST /api/write (Virtual Memory Write) --- {"success":true,"method":"mmap_virtual_memory_write",...}
--- 9. Testing POST /api/sync (msync syscall) --- {"success":true,...}
--- 10. Testing GET /api/info (stat + mincore) --- {"success":true,...}
--- 11. Testing POST /api/resize (ftruncate syscall) --- {"success":true,...}
--- 12. Testing POST /api/unmap (munmap syscall) --- {"success":true,...}
--- 13. Testing Security Directory Traversal Block --- {"success":false,...}
--- 14. Testing Security Slash Traversal Block --- {"success":false,...}
--- 15. Testing POST /api/delete (unlink syscall) --- {"success":true,...}
All 15 verification tests passed!
```

---

## ❓ Common Errors & Troubleshooting

### 1. `Port 8080 already in use (bind failed)`
- **Cause**: Another process or previous server instance is using port 8080.
- **Fix**: Kill the occupying process or pass a custom port:
  ```bash
  # Check what process is on 8080
  fuser -k 8080/tcp
  
  # Or start on another port (e.g., 9090)
  ./memory_server 9090
  ```

### 2. `mmap() returned EINVAL (Invalid Argument)`
- **Cause**: Attempting to call `mmap()` on an empty file with `st_size = 0`. POSIX requires `length > 0`.
- **Fix**: Handled automatically in `memory_manager.c` by expanding empty files to 64 bytes using `ftruncate()` before mapping.

### 3. `Segmentation fault or SIGBUS when accessing mapped memory`
- **Cause**: Writing past the end of the mapped file size.
- **Fix**: In this project, `mm_write_file()` checks bounds and automatically calls `ftruncate()` and `mmap()` to expand the mapping safely.

### 4. `start.sh: line 2: $'\r': command not found`
- **Cause**: File was saved with Windows CRLF line endings instead of Unix LF.
- **Fix**: Convert to Unix line endings:
  ```bash
  sed -i 's/\r$//' start.sh
  chmod +x start.sh
  ```

---

## 📜 Academic Integrity & License

Developed for academic coursework in Operating Systems and System Programming (OSSP). Released under the MIT License.

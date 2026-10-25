# Academic Project Report
## Linux Memory-Mapped File Management System
**Course**: Operating Systems and System Programming (OSSP)  
**Academic Year**: 2025–2026  
**Implementation Platform**: Ubuntu Linux (POSIX Compliant)  
**Programming Language**: C (GNU C11 Standards) & Web Technologies  

---

## 1. Title of the Project
**Linux Memory-Mapped File Management System (L-MMFMS)**  
*A High-Performance System Programming Framework Demonstrating Zero-Copy Virtual Memory Operations, Demand Paging, and POSIX System Calls via an Interactive Web Dashboard.*

---

## 2. Abstract
Traditional file input/output in Unix and Linux operating systems relies on the standard `read()` and `write()` system call primitives. While universally supported, this approach introduces noticeable performance overhead due to repeated user-space to kernel-space context switches and multiple redundant data copies through intermediate kernel page cache buffers.

This project designs and implements the **Linux Memory-Mapped File Management System**, a full-featured, zero-copy system programming application developed in C. It directly leverages the Linux kernel's virtual memory subsystem via `mmap()`, `munmap()`, and `msync()` system calls. By mapping regular files residing in physical storage into the 64-bit virtual address space of the user process, file content is read and modified as if it were a direct byte array in RAM. To make these complex low-level OS mechanisms transparent and pedagogical, the backend incorporates a high-performance multithreaded POSIX socket HTTP server that streams real-time virtual memory telemetry, inode metadata, and system call execution logs to an interactive web dashboard.

---

## 3. Introduction
Operating Systems govern how hardware resources—specifically CPU, physical memory (RAM), and secondary block storage (Disks)—are partitioned and shared among user processes. In traditional file systems, accessing a file requires allocating a user buffer, executing the `read()` system call, waiting for a context switch into supervisor mode, transferring data from the storage drive to the kernel page cache, copying that data into user space, and switching back.

Memory-mapped file I/O completely transforms this paradigm. Introduced to Unix in BSD 4.3 and standardized under POSIX.1, `mmap()` binds a file descriptor directly to a range of virtual memory pages within the process's Virtual Memory Area (VMA). The hardware Memory Management Unit (MMU) handles translation, demand paging, and page faults transparently. This project provides an end-to-end realization of this low-level mechanism, bridging C system programming with modern web visualization.

---

## 4. Problem Statement
In computer science curricula, students often study Virtual Memory, Page Tables, Inodes, and File Descriptors as abstract theoretical constructs. Textbooks illustrate virtual-to-physical address translation, but students rarely observe:
1. The exact hexadecimal virtual addresses assigned to files in user address space.
2. The concrete difference in CPU overhead between pointer dereferencing versus kernel `read()`/`write()` context switches.
3. How modifying bytes in memory triggers the Page Table "Dirty Bit" before disk synchronization.
4. How empty files (`0 bytes`) interact with page-aligned memory allocators.

Furthermore, command-line inspection tools (such as `pmap`, `strace`, and `vmstat`) present dense textual output that is difficult to correlate with application-level actions. There is a need for a unified system that executes authentic Linux system calls while providing clear, interactive visual feedback.

---

## 5. Objectives
The primary objectives of this project are:
1. **Real Kernel System Call Implementation**: Implement full file lifecycle operations using true Linux system calls: `open()`, `close()`, `read()`, `write()`, `lseek()`, `fstat()`, `ftruncate()`, `mmap()`, `munmap()`, `msync()`, and `mincore()`.
2. **Zero-Copy Memory Manipulation**: Demonstrate direct memory pointer writes (`memcpy`) that modify file content without invoking the `write()` system call.
3. **Dirty Page Coherency Management**: Visualize the state of modified memory pages and explicitly synchronize them to physical block storage using `msync(MS_SYNC)`.
4. **Physical RAM Residency Telemetry**: Query the Linux kernel via `mincore()` to verify whether mapped pages are physically resident in RAM or paged out.
5. **Self-Contained Architecture**: Build a pure C HTTP server using POSIX sockets (`sys/socket.h`), eliminating dependencies on external runtimes like Python or Node.js.
6. **Path Traversal Security**: Enforce security boundaries preventing unauthorized filesystem traversal outside the designated `./data/` sandbox.
7. **Educational Interactive Dashboard**: Provide a responsive terminal-inspired UI that visually illuminates each stage of the memory mapping pipeline during execution.

---

## 6. Existing System
In standard file handling systems:
- File operations use high-level library abstractions (e.g., standard C `fopen`, `fread`, `fwrite`, or scripting wrappers).
- Data must traverse multiple abstraction layers:
  1. Disk &rarr; 2. Storage Controller &rarr; 3. Kernel Page Cache &rarr; 4. System Call Boundary &rarr; 5. User Process Buffer.
- For large files, random access requires frequent `lseek()` system calls, each triggering user-kernel privilege mode transitions.
- Internal kernel states (such as active VMA descriptors, base memory addresses, and page dirtiness) are hidden from the user.

### Disadvantages of the Existing System
- **Double Copy Overhead**: Data is copied twice for every I/O transaction.
- **Context Switch Latency**: Each read/write requires switching from Ring 3 (User) to Ring 0 (Kernel).
- **High Memory Footprint**: Dual buffers in kernel space and user space consume duplicate physical RAM.
- **Opacity**: No direct visibility into page-level memory allocation or hardware MMU behavior.

---

## 7. Proposed System
The proposed system replaces repetitive buffer copies with memory-mapped file regions:
- The file is mapped into the process's 64-bit address space using `mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)`.
- The user process receives a direct virtual pointer (`void *mapped_addr`).
- Reading data is a direct pointer dereference (`*(char *)(addr + offset)`).
- Writing data is a memory write (`memcpy(addr + offset, data, len)`).
- Changes trigger the CPU MMU hardware dirty bit, updated in the Linux kernel Page Cache.
- Explicit persistence is achieved on-demand through `msync()`.
- An integrated pure C web server serves a live dashboard rendering the exact virtual addresses, Inode numbers, page counts, and system call execution traces.

---

## 8. System Architecture

```
+--------------------------------------------------------------------------+
|                        Client Web Browser (Port 8080)                    |
|       - Dashboard UI        - Hex Dump Inspector   - Pipeline Visualizer |
|       - File Explorer       - Inode Telemetry      - System Call Logs    |
+--------------------------------------------------------------------------+
                                     │  ▲
             JSON REST Calls (Fetch) │  │  HTTP Responses (Status / Data)
                                     ▼  │
+--------------------------------------------------------------------------+
|                     Pure C HTTP Server (server.c)                        |
|       - POSIX TCP Sockets (bind, listen, accept)                         |
|       - Multithreaded Worker Pool (pthread_create detached)              |
|       - REST Router & Lightweight JSON Parsing Engine                    |
+--------------------------------------------------------------------------+
                                     │
                                     ▼
+--------------------------------------------------------------------------+
|                  Memory Manager Engine (memory_manager.c)                |
|       - Active Mappings Registry (MappedFileEntry Table)                 |
|       - Mutex Concurrency Protection (pthread_mutex_t)                   |
|       - Security Path Traversal Validation Sandbox                       |
+--------------------------------------------------------------------------+
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
+-----------------------------------+   +----------------------------------+
|    Standard POSIX Syscalls        |   |   Linux Virtual Memory Syscalls  |
|    - open(), close()              |   |   - mmap(MAP_SHARED, PROT_RW)    |
|    - read(), write()              |   |   - munmap(addr, length)         |
|    - lseek(), ftruncate()         |   |   - msync(MS_SYNC)               |
|    - fstat(), unlink()            |   |   - mincore()                    |
+-----------------------------------+   +----------------------------------+
         │                                                       │
         ▼                                                       ▼
+--------------------------------------------------------------------------+
|                           Linux Kernel & VFS                             |
|       - Virtual Memory Area (VMA)   - Page Cache & Page Tables           |
|       - Inode Table Management       - Ext4 Storage Driver               |
+--------------------------------------------------------------------------+
                                     │
                                     ▼
+--------------------------------------------------------------------------+
|                      Physical Storage (./data/)                          |
+--------------------------------------------------------------------------+
```

---

## 9. Technologies Used

### Backend
- **Programming Language**: C (GNU C11 standard)
- **Compiler**: GCC (GNU Compiler Collection) with `-Wall -Wextra -O2 -pthread`
- **Networking**: POSIX Berkeley Sockets (`sys/socket.h`, `netinet/in.h`)
- **Threading**: POSIX Threads (`pthread.h`) for concurrent HTTP request handling
- **Operating System API**: POSIX.1-2008 & Linux Kernel System Calls (`sys/mman.h`, `sys/stat.h`, `unistd.h`, `fcntl.h`)

### Frontend
- **Markup**: Semantic HTML5
- **Styling**: Vanilla CSS3 (Custom Dark Terminal / Cyberpunk Workstation design system, CSS Grid, Flexbox, Keyframe animations)
- **Scripting**: Modern Vanilla JavaScript (ES6+, Async/Await, Fetch API, DOM manipulation)
- **External Frameworks**: None (Zero third-party npm packages, Python, or Ruby dependencies)

---

## 10. Linux System Calls Used

The project demonstrates 11 fundamental Linux system calls:

| System Call | Prototype | Purpose in Project |
| :--- | :--- | :--- |
| `mmap()` | `void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset)` | Maps file from disk into process virtual address space. Returns the base 64-bit pointer. |
| `munmap()` | `int munmap(void *addr, size_t length)` | Releases the Virtual Memory Area (VMA) mapping and frees address space. |
| `msync()` | `int msync(void *addr, size_t length, int flags)` | Flushes dirty virtual memory pages to physical disk storage using `MS_SYNC`. |
| `mincore()` | `int mincore(void *addr, size_t length, unsigned char *vec)` | Queries the kernel to verify which virtual pages currently reside in physical RAM. |
| `open()` | `int open(const char *pathname, int flags, mode_t mode)` | Opens file descriptors with `O_RDWR`, `O_CREAT`, and `O_EXCL` flags. |
| `close()` | `int close(int fd)` | Releases file descriptors back to the OS table. |
| `read()` | `ssize_t read(int fd, void *buf, size_t count)` | Reads data via standard file descriptor path (used to contrast with `mmap`). |
| `write()` | `ssize_t write(int fd, const void *buf, size_t count)` | Writes data via traditional system call buffer path. |
| `lseek()` | `off_t lseek(int fd, off_t offset, int whence)` | Repositions read/write file offset pointer. |
| `fstat()` / `stat()` | `int fstat(int fd, struct stat *statbuf)` | Retrieves Inode metadata, byte size, blocks, permissions, and timestamps. |
| `ftruncate()` | `int ftruncate(int fd, off_t length)` | Resizes the file to a specified length (required before expanding mappings to prevent `SIGBUS`). |
| `unlink()` | `int unlink(const char *pathname)` | Deletes a file entry from the filesystem directory. |

---

## 11. Module Description

### 11.1. HTTP Server Module (`server.c`)
- **Socket Initialization**: Creates an `AF_INET` streaming socket, applies `SO_REUSEADDR` to prevent port-binding lockouts, binds to `0.0.0.0:8080`, and listens for connections.
- **Worker Thread Pool**: Spawns detached POSIX threads (`pthread_create`) per incoming TCP connection, enabling simultaneous asset downloads (`index.html`, `style.css`, `script.js`) without pipeline blocking.
- **HTTP/1.1 Parser**: Parses request lines (`GET`, `POST`, `HEAD`, `OPTIONS`), extracts `Content-Length`, headers, and query strings, and handles CORS preflight headers.
- **Self-Contained JSON Extractor**: Lightweight parsing functions (`json_extract_string`, `json_extract_int`, `json_extract_bool`) parse incoming API payloads without external libraries.
- **Signal Handling**: Catches `SIGINT` (Ctrl+C) and `SIGTERM` to gracefully invoke `mm_cleanup()` and terminate cleanly.

### 11.2. Memory Manager Module (`memory_manager.c`, `memory_manager.h`)
- **Active Mappings Table**: Maintains an internal table of `MappedFileEntry` structures tracking:
  - `filename`, `filepath`, `fd`, `mapped_addr`, `mapped_size`, `prot`, `flags`, `is_mapped`, `is_dirty`, `write_count`, and timestamps.
- **Concurrency Control**: Synchronizes all table modifications with `pthread_mutex_t`.
- **Sandbox Security**: `mm_validate_filename()` rejects any filename containing directory traversal sequences (`..`, `/`, `\`), or hidden files.
- **Boundary Handling**: If a user maps an empty file (`st_size = 0`), the system automatically expands it to 64 bytes via `ftruncate()`, preventing the `EINVAL` error inherent to POSIX `mmap()`.
- **Dynamic Resize & Remap**: When writing beyond the currently mapped size, the module safely unmaps the existing pointer, calls `ftruncate()` to expand the file, and remaps the new virtual address space to avoid `SIGBUS` faults.

### 11.3. Web Interface Module (`index.html`, `style.css`, `script.js`)
- **Interactive Visualizer**: Illuminates the active data flow across 7 pipeline stages from disk blocks to virtual pointers.
- **Memory Buffer Editor & Hex Inspector**: Provides side-by-side editing and formatted hexadecimal inspection (offset, 16 hex bytes/line, ASCII decoding).
- **Deep Inode Telemetry**: Displays low-level `struct stat` properties and `mincore()` page residency.
- **Viva Demo Automation**: An automated 8-step test workflow that demonstrates the complete file lifecycle at the click of a button.

---

## 12. Working and Internals of `mmap()`

```
Virtual Address Space of Process (64-bit)
+------------------------------------+ 0x7FFFFFFFFFFF
|            Kernel Space            |
+------------------------------------+ 0x7F0000000000
|                Stack               |
|                  ↓                 |
+------------------------------------+
|         Memory Mapping Area        |
|    [0x7dca9d1d3000 - 0x7dca...]    | <--- mmap() reserves VMA here
|      Mapped File: test.txt         |
+------------------------------------+
|                  ↑                 |
|                Heap                |
+------------------------------------+
|             BSS / Data             |
+------------------------------------+
|             Text / Code            |
+------------------------------------+ 0x000000000000
```

### The 4-Step Lifecycle of a Memory-Mapped File:

1. **Virtual Address Space Reservation (VMA Creation)**:
   When `mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)` is invoked, the Linux kernel allocates a `vm_area_struct` within the process memory descriptor (`mm_struct`). No physical disk blocks are loaded into RAM yet.

2. **Demand Paging & Major Page Fault**:
   When the process first accesses a memory address within the range (e.g., via `memcpy` or reading a pointer), the hardware MMU checks the Page Table. Seeing the page is absent, it triggers a **Page Fault (Interrupt 14)**. The Linux kernel page fault handler intercepts this, locates the corresponding block on disk via the inode, allocates a 4 KB physical RAM frame, reads the data from disk into the Page Cache, updates the Page Table entry, and resumes process execution.

3. **In-Memory Modification & The Dirty Bit**:
   When bytes are written directly to the pointer, the processor sets the **Dirty Bit** in the Page Table Entry (PTE). The modified bytes reside in high-speed RAM.

4. **Synchronization to Disk (`msync`)**:
   Calling `msync(addr, size, MS_SYNC)` instructs the kernel to scan the PTEs for dirty bits and synchronously write those modified pages back to the block device (Ext4 filesystem), resetting the dirty bit.

---

## 13. Web Architecture & API Specifications

The client and server communicate via standard HTTP REST transactions returning `application/json` responses:

```
[Browser Client] ──(HTTP POST /api/map)──> [POSIX Socket Listener]
                                                     │
                                             [Worker Thread]
                                                     │
                                             [mm_map_file()]
                                                     │
                                             [Linux mmap()]
                                                     │
[Browser Client] <──(JSON: {address: "0x7f..."})────┘
```

### Key API Endpoints

- `GET /api/files`: Returns list of files with size, inode, permissions, and active mapping state.
- `POST /api/create`: Creates file via `open(O_CREAT | O_RDWR)` and `write()`.
- `POST /api/map`: Invokes `open()`, `fstat()`, and `mmap()`.
- `POST /api/read`: Reads via mapped memory pointer dereference (`mmap_direct_pointer_access`).
- `POST /api/write`: Writes via direct pointer `memcpy` (`mmap_virtual_memory_write`).
- `POST /api/sync`: Flushes dirty pages via `msync(MS_SYNC)`.
- `POST /api/resize`: Calls `ftruncate()` and updates mappings.
- `POST /api/unmap`: Invokes `munmap()` and closes descriptors.
- `POST /api/delete`: Unlinks file from filesystem via `unlink()`.
- `GET /api/info?file=<name>`: Returns complete `struct stat` and `mincore()` telemetry.

---

## 14. Implementation Details

### Core C Data Structure (`MappedFileEntry`)
```c
typedef struct {
    char filename[MAX_FILENAME_LEN];
    char filepath[MAX_PATH_LEN];
    int fd;
    void *mapped_addr;       /* Virtual address returned by mmap() */
    size_t mapped_size;      /* Mapped memory byte size */
    int prot;                /* PROT_READ | PROT_WRITE */
    int flags;               /* MAP_SHARED */
    int is_mapped;           /* 1 if active, 0 otherwise */
    int is_dirty;            /* 1 if modified in RAM and un-synced */
    time_t map_time;         /* Timestamp when mapped */
    time_t last_sync_time;   /* Timestamp of last msync() */
    size_t write_count;      /* Total writes through memory */
} MappedFileEntry;
```

### Memory Mapping Implementation Snippet
```c
/* Open file descriptor */
int fd = open(path, O_RDWR);

/* Retrieve file metadata */
struct stat st;
fstat(fd, &st);

/* Map into process virtual address space */
void *addr = mmap(NULL, st.st_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);

/* Direct memory write without write() syscall */
memcpy((char *)addr + offset, buffer, length);

/* Flush dirty memory pages to disk */
msync(addr, st.st_size, MS_SYNC | MS_INVALIDATE);

/* Release virtual memory */
munmap(addr, st.st_size);
close(fd);
```

---

## 15. Screenshots Placeholders

The following screenshots illustrate key states of the operational system:

### Screenshot 1: Main Dashboard Overview
```
+-----------------------------------------------------------------------------------------------+
| [LOGO] Linux Memory-Mapped File Management System               PAGE: 4096 B | MMAPS: 1 | ON  |
+-----------------------------------------------------------------------------------------------+
| EXPLORER (/data) | ACTIVE: test.txt  [MAPPED] [DIRTY]           PTR: 0x7DCA9D1D3000           |
| test.txt (43 B)  | Descr: fd 6  • Size: 43 B • Inode: 26177172834307110 • Mode: -rwxrwxrwx    |
| sample.dat (1 KB)|----------------------------------------------------------------------------|
|                  | [mmap()] [msync()] [munmap()] [read()] [write()] [ftruncate()] [unlink()]   |
|                  |----------------------------------------------------------------------------|
|                  | PIPELINE: [Disk] -> [fd 6] -> [mmap()] -> [0x7DCA...] -> [App] -> [msync]  |
|                  |----------------------------------------------------------------------------|
|                  | BUFFER EDITOR: "Hello from Linux mmap! [Modified in Memory]"               |
|                  | TERMINAL LOG: [12:04:10] SYS_WRITE: memcpy(0x7DCA9D1D3000) Dirty bit set  |
+-----------------------------------------------------------------------------------------------+
*Description: The main dashboard showing active mapped pointer address, dirty bit badge, pipeline diagram, and live terminal activity log.*
```

### Screenshot 2: Hex Dump Inspector Pane
```
+-----------------------------------------------------------------------------------------------+
| Offset    | Hexadecimal Bytes (16 per line)               | ASCII Decoding                   |
+-----------------------------------------------------------------------------------------------+
| 00000000: | 48 65 6c 6c 6f 20 66 72 6f 6d 20 4c 69 6e 75 78 | |Hello from Linux|               |
| 00000010: | 20 6d 6d 61 70 21 20 5b 4d 6f 64 69 66 69 65 64 | | mmap! [Modified|               |
| 00000020: | 20 69 6e 20 4d 65 6d 6f 72 79 5d                | | in Memory]     |               |
+-----------------------------------------------------------------------------------------------+
*Description: Byte-level inspection pane rendering raw virtual memory contents formatted identically to Linux xxd.*
```

### Screenshot 3: Inode & `mincore()` Hardware Telemetry Pane
```
+-----------------------------------------------------------------------------------------------+
| Inode: 26177172834307110   | Size: 43 Bytes      | Block Size: 4096 B  | Mode: 0777           |
| UID/GID: 1000 / 1000       | Hard Links: 1       | Disk Blocks: 0      | Virtual Pages: 1     |
| RAM Resident: 1 Page (mincore)                   | Write Count: 1      | Last Sync: 12:04:12  |
+-----------------------------------------------------------------------------------------------+
*Description: Detailed Linux filesystem statistics and mincore() resident page validation.*
```

---

## 16. Testing and Verification

The system was verified on Ubuntu 24.04 LTS using the automated verification suite (`test_suite.sh`):

| Test ID | Test Description | Input / Trigger | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Static Asset Serving | `GET /` | HTTP 200 OK, HTML served | HTTP 200 OK (`26036` bytes) | **PASS** |
| **TC-02** | Style Asset Serving | `GET /style.css` | HTTP 200 OK, CSS served | HTTP 200 OK (`25091` bytes) | **PASS** |
| **TC-03** | Script Asset Serving | `GET /script.js` | HTTP 200 OK, JS served | HTTP 200 OK (`36825` bytes) | **PASS** |
| **TC-04** | File Creation | `POST /api/create` (`test.txt`) | File created in `./data/` | Inode generated, `success: true` | **PASS** |
| **TC-05** | Memory Mapping | `POST /api/map` (`test.txt`) | Pointer returned, `MAP_SHARED` | Address `0x7dca9d1d3000` | **PASS** |
| **TC-06** | Direct Pointer Read | `POST /api/read` | Zero-copy pointer dereference | Content returned, method verified | **PASS** |
| **TC-07** | Virtual Memory Write | `POST /api/write` | `memcpy` write, dirty bit set | Written without `write()` syscall | **PASS** |
| **TC-08** | Memory Synchronization | `POST /api/sync` | `msync(MS_SYNC)` flush | Dirty pages committed to disk | **PASS** |
| **TC-09** | Inode & RAM Telemetry | `GET /api/info` | `stat` + `mincore()` report | 1 resident RAM page verified | **PASS** |
| **TC-10** | File Resize & Remap | `POST /api/resize` (`128 B`) | `ftruncate()` + remapping | Resized from 43B to 128B | **PASS** |
| **TC-11** | Unmap Virtual Memory | `POST /api/unmap` | `munmap()` and `close(fd)` | Address released, table cleared | **PASS** |
| **TC-12** | Directory Traversal Attack | `POST /api/create` (`../../shadow`) | Rejection by sandbox | `error: Invalid filename` | **PASS** |
| **TC-13** | Root Traversal Attack | `POST /api/create` (`/etc/passwd`) | Rejection by sandbox | `error: Invalid filename` | **PASS** |
| **TC-14** | File Deletion | `POST /api/delete` | `unlink()` removes file | File removed from `./data/` | **PASS** |
| **TC-15** | Empty File Auto-Resize | `POST /api/map` (0-byte file) | Auto `ftruncate` to prevent `EINVAL` | Resized to 64B, mapped cleanly | **PASS** |

---

## 17. Advantages of the Proposed System

1. **High Performance**: Achieves Zero-Copy I/O by eliminating intermediate kernel-to-user buffer copying.
2. **Simplified Random Access**: Accessing any arbitrary byte in a gigabyte-scale file requires simple pointer arithmetic (`ptr + offset`) rather than expensive `lseek()` system calls.
3. **Hardware-Level Paging**: Leverages the CPU MMU and OS page cache for demand paging, loading only requested 4 KB blocks into RAM.
4. **Self-Contained & Lightweight**: Zero external runtime overhead; compiles to a single native binary of ~48 KB.
5. **Educational Clarity**: Demystifies OS concepts (virtual memory, page tables, dirty bits, inodes) through real-time telemetry and visualization.

---

## 18. Limitations

1. **Address Space Consumption on 32-bit Systems**: While 64-bit systems possess 256 TB of virtual address space, mapping multi-gigabyte files on 32-bit architectures can lead to address space exhaustion.
2. **Page Fault Latency on First Access**: Major page faults cause small initial latencies when pages are first brought into RAM from slower disk drives.
3. **Fixed Mapping Granularity**: Files are mapped in increments of hardware page sizes (typically 4096 bytes on x86_64), causing minor internal fragmentation for small files.

---

## 19. Future Scope

1. **`madvise()` Integration**: Implement kernel hints (`MADV_SEQUENTIAL`, `MADV_WILLNEED`, `MADV_DONTNEED`) to optimize readahead algorithms.
2. **Copy-On-Write (`MAP_PRIVATE`) Demonstration**: Add a split-screen multi-process visualizer showing private memory divergence upon write.
3. **Real-Time Memory Profiling**: Integrate real-time graphs tracking RSS (Resident Set Size) and Page Fault frequencies parsed from `/proc/[pid]/smaps`.
4. **POSIX Shared Memory (`shm_open`)**: Extend memory mapping across distinct independent processes for high-speed IPC (Inter-Process Communication).

---

## 20. Conclusion
The **Linux Memory-Mapped File Management System** successfully bridges theoretical operating systems fundamentals with practical systems engineering. By combining genuine Linux system calls (`mmap`, `munmap`, `msync`, `ftruncate`, `fstat`, `mincore`) with a robust pure C POSIX server and a cyberpunk terminal dashboard, the project delivers a comprehensive, highly responsive, and pedagogically rich demonstration of virtual memory and zero-copy file management.

---

## 21. References
1. Kerrisk, Michael. *The Linux Programming Interface: A Linux and UNIX System Programming Handbook*. No Starch Press, 2010.
2. Silberschatz, Abraham, Peter B. Galvin, and Greg Gagne. *Operating System Concepts (10th Edition)*. Wiley, 2018.
3. Tanenbaum, Andrew S., and Herbert Bos. *Modern Operating Systems (4th Edition)*. Pearson, 2015.
4. Stevens, W. Richard, and Stephen A. Rago. *Advanced Programming in the UNIX Environment (3rd Edition)*. Addison-Wesley, 2013.
5. Linux Programmer's Manual. `mmap(2)` — Map files or devices into memory. `man7.org/linux/man-pages/man2/mmap.2.html`.
6. Linux Programmer's Manual. `msync(2)` — Synchronize a file with a memory map. `man7.org/linux/man-pages/man2/msync.2.html`.
7. Linux Programmer's Manual. `mincore(2)` — Determine whether pages are resident in memory. `man7.org/linux/man-pages/man2/mincore.2.html`.

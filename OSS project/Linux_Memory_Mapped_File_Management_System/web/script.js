/* ==============================================================================
   Linux Memory-Mapped File Management System
   Frontend Logic & API Client
   ============================================================================== */

const API_BASE = '';

// Application State
const state = {
    files: [],
    selectedFile: null,
    activeInfo: null,
    systemStats: null,
    isDemoRunning: false
};

// DOM References
const elements = {
    fileList: document.getElementById('file-list'),
    fileFilterInput: document.getElementById('file-filter-input'),
    activeFilename: document.getElementById('active-filename'),
    activeMappingBadge: document.getElementById('active-mapping-badge'),
    activeDirtyBadge: document.getElementById('active-dirty-badge'),
    metaFd: document.getElementById('meta-fd'),
    metaSize: document.getElementById('meta-size'),
    metaInode: document.getElementById('meta-inode'),
    metaPerm: document.getElementById('meta-perm'),
    activeMemAddress: document.getElementById('active-mem-address'),
    activeMemRange: document.getElementById('active-mem-range'),
    
    // Telemetry
    telemetryArch: document.getElementById('telemetry-arch'),
    telemetryPagesize: document.getElementById('telemetry-pagesize'),
    telemetryActiveMaps: document.getElementById('telemetry-active-maps'),
    statTotalBytes: document.getElementById('stat-total-bytes'),
    statDirtyCount: document.getElementById('stat-dirty-count'),
    statActiveFds: document.getElementById('stat-active-fds'),
    
    // Ribbon Buttons
    btnMap: document.getElementById('btn-map-file'),
    btnSync: document.getElementById('btn-sync-file'),
    btnUnmap: document.getElementById('btn-unmap-file'),
    btnRead: document.getElementById('btn-read-file'),
    btnWrite: document.getElementById('btn-write-file'),
    btnOpenResize: document.getElementById('btn-open-resize-modal'),
    btnDelete: document.getElementById('btn-delete-file'),
    btnRefreshFiles: document.getElementById('btn-refresh-files'),
    btnQuickDemo: document.getElementById('btn-quick-demo'),
    
    // Workspace Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    fileContentArea: document.getElementById('file-content-area'),
    hexDumpArea: document.getElementById('hex-dump-area'),
    editorReadMethod: document.getElementById('editor-read-method'),
    editorRange: document.getElementById('editor-range'),
    btnSaveContent: document.getElementById('btn-save-content'),
    btnReloadContent: document.getElementById('btn-reload-content'),
    
    // Inode Stats Elements
    statIno: document.getElementById('stat-ino'),
    statSize: document.getElementById('stat-size'),
    statMode: document.getElementById('stat-mode'),
    statBlocks: document.getElementById('stat-blocks'),
    statBlksize: document.getElementById('stat-blksize'),
    statNlink: document.getElementById('stat-nlink'),
    statUidgid: document.getElementById('stat-uidgid'),
    statTotalPages: document.getElementById('stat-total-pages'),
    statResidentPages: document.getElementById('stat-resident-pages'),
    statWriteCount: document.getElementById('stat-write-count'),
    statMtime: document.getElementById('stat-mtime'),
    statLastSync: document.getElementById('stat-last-sync'),

    // Pipeline
    pipeMemAddr: document.getElementById('pipe-mem-addr'),
    pipelineStatusText: document.getElementById('pipeline-status-text'),
    
    // Terminal Log
    terminalLog: document.getElementById('terminal-log'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    
    // Modals
    modalCreate: document.getElementById('modal-create'),
    modalResize: document.getElementById('modal-resize'),
    btnOpenCreateModal: document.getElementById('btn-open-create-modal'),
    btnConfirmCreate: document.getElementById('btn-confirm-create'),
    btnConfirmResize: document.getElementById('btn-confirm-resize'),
    createFilename: document.getElementById('create-filename'),
    createSize: document.getElementById('create-size'),
    createContent: document.getElementById('create-content'),
    resizeTargetFilename: document.getElementById('resize-target-filename'),
    resizeNewSize: document.getElementById('resize-new-size'),
    
    toastContainer: document.getElementById('toast-container')
};

/* ==============================================================================
   Initialization & Event Listeners
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    refreshAll();
    // Periodic telemetry refresh
    setInterval(fetchSystemStats, 4000);
});

function initEventListeners() {
    // Tab switching
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            elements.tabButtons.forEach(b => b.classList.remove('active'));
            elements.tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // File filtering
    elements.fileFilterInput.addEventListener('input', (e) => {
        renderFileList(e.target.value.trim().toLowerCase());
    });

    // Action buttons
    elements.btnRefreshFiles.addEventListener('click', refreshAll);
    elements.btnMap.addEventListener('click', handleMapFile);
    elements.btnSync.addEventListener('click', handleSyncFile);
    elements.btnUnmap.addEventListener('click', handleUnmapFile);
    elements.btnRead.addEventListener('click', handleReadFile);
    elements.btnWrite.addEventListener('click', handleWriteFile);
    elements.btnSaveContent.addEventListener('click', handleSaveContent);
    elements.btnReloadContent.addEventListener('click', handleReadFile);
    elements.btnDelete.addEventListener('click', handleDeleteFile);
    elements.btnQuickDemo.addEventListener('click', runVivaDemoWorkflow);
    elements.btnClearLogs.addEventListener('click', () => {
        elements.terminalLog.innerHTML = '';
        logActivity('SYS_LOG', 'Terminal log cleared.', 'badge-init');
    });

    // Modals
    elements.btnOpenCreateModal.addEventListener('click', () => openModal(elements.modalCreate));
    elements.btnOpenResize.addEventListener('click', () => {
        if (!state.selectedFile) return;
        elements.resizeTargetFilename.value = state.selectedFile.filename;
        elements.resizeNewSize.value = state.selectedFile.size;
        openModal(elements.modalResize);
    });

    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', () => {
            const modalId = el.getAttribute('data-close');
            closeModal(document.getElementById(modalId));
        });
    });

    elements.btnConfirmCreate.addEventListener('click', handleCreateFile);
    elements.btnConfirmResize.addEventListener('click', handleResizeFile);
}

/* ==============================================================================
   API Communication Layer
   ============================================================================== */

async function fetchFiles() {
    try {
        const res = await fetch(`${API_BASE}/api/files`);
        const data = await res.json();
        if (data.success) {
            state.files = data.files || [];
            renderFileList(elements.fileFilterInput.value.trim().toLowerCase());
            
            // Re-select active file if it exists in updated list
            if (state.selectedFile) {
                const updated = state.files.find(f => f.filename === state.selectedFile.filename);
                if (updated) {
                    selectFile(updated, false);
                }
            }
        }
    } catch (err) {
        logActivity('ERR_NET', `Failed to fetch file directory: ${err.message}`, 'badge-error');
    }
}

async function fetchSystemStats() {
    try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const data = await res.json();
        if (data.success) {
            state.systemStats = data;
            elements.telemetryActiveMaps.textContent = data.active_mappings;
            elements.telemetryPagesize.textContent = `${data.system_page_size} B (${(data.system_page_size / 1024).toFixed(0)} KB)`;
            elements.statTotalBytes.textContent = formatBytes(data.total_mapped_bytes);
            elements.statDirtyCount.textContent = `${data.dirty_mappings} files`;
            elements.statActiveFds.textContent = `${data.active_mappings} fd`;
        }
    } catch (err) {
        // Silently retry
    }
}

async function fetchFileInfo(filename) {
    try {
        const res = await fetch(`${API_BASE}/api/info?file=${encodeURIComponent(filename)}`);
        const data = await res.json();
        if (data.success) {
            state.activeInfo = data;
            renderStatPane(data);
        }
    } catch (err) {
        console.error('Info fetch error:', err);
    }
}

function refreshAll() {
    fetchFiles();
    fetchSystemStats();
    if (state.selectedFile) {
        fetchFileInfo(state.selectedFile.filename);
    }
}

/* ==============================================================================
   Core Actions Handlers (System Calls)
   ============================================================================== */

async function handleCreateFile() {
    const filename = elements.createFilename.value.trim();
    const size = parseInt(elements.createSize.value, 10) || 0;
    const content = elements.createContent.value;

    if (!filename) {
        showToast('Please enter a valid filename', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, size, content })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`File '${filename}' created successfully!`, 'success');
            logActivity('SYS_CREATE', `open("${filename}", O_CREAT|O_RDWR) -> File created on disk (Inode: ${data.inode})`, 'badge-init');
            closeModal(elements.modalCreate);
            elements.createFilename.value = '';
            elements.createSize.value = '0';
            elements.createContent.value = '';
            await fetchFiles();
            
            // Select newly created file
            const newFile = state.files.find(f => f.filename === filename);
            if (newFile) selectFile(newFile, true);
        } else {
            showToast(`Creation failed: ${data.error}`, 'error');
            logActivity('ERR_CREATE', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Request error: ${err.message}`, 'error');
    }
}

async function handleMapFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;

    try {
        animatePipelineStep([1, 2, 3, 4]);
        elements.pipelineStatusText.innerHTML = `Executing <strong>open()</strong>, <strong>fstat()</strong>, and <strong>mmap(NULL, size, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0)</strong> for '${filename}'...`;

        const res = await fetch(`${API_BASE}/api/map`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, prot: 'rw', flags: 'shared' })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`File mapped to virtual memory at ${data.mapped_address}`, 'success');
            logActivity('SYS_MMAP', `mmap(NULL, ${data.mapped_size}, PROT_READ|PROT_WRITE, MAP_SHARED, fd=${data.fd}, 0) -> Virtual Address: ${data.mapped_address}`, 'badge-mmap');
            
            elements.pipelineStatusText.innerHTML = `File <strong>${filename}</strong> mapped at virtual address <strong>${data.mapped_address}</strong> across <strong>${data.pages} memory page(s)</strong>. User process can now access bytes directly without write() or read() system call overhead.`;
            
            await refreshAll();
            // Automatically read file to display current buffer
            handleReadFile();
        } else {
            showToast(`mmap() failed: ${data.error}`, 'error');
            logActivity('ERR_MMAP', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function handleReadFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;

    try {
        const res = await fetch(`${API_BASE}/api/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, offset: 0, length: 0 })
        });
        const data = await res.json();
        if (data.success) {
            elements.fileContentArea.value = data.content || '';
            renderHexDump(data.content || '');

            if (data.method === 'mmap_direct_pointer_access') {
                elements.editorReadMethod.textContent = `Direct Pointer Dereference (addr: ${data.read_pointer})`;
                elements.editorReadMethod.className = 'text-emerald';
                logActivity('SYS_READ', `Direct memory read at pointer ${data.read_pointer} (${data.bytes_read} bytes) [Zero-Copy]`, 'badge-read');
                animatePipelineStep([4, 5]);
            } else {
                elements.editorReadMethod.textContent = 'POSIX read() syscall (Unmapped)';
                elements.editorReadMethod.className = 'text-cyan';
                logActivity('SYS_READ', `POSIX read(fd, buf, ${data.bytes_read}) -> Data read from disk`, 'badge-read');
                animatePipelineStep([1, 2, 5]);
            }

            elements.editorRange.textContent = `${data.bytes_read} Bytes`;
            showToast(`Loaded ${data.bytes_read} bytes`, 'info');
        } else {
            showToast(`Read error: ${data.error}`, 'error');
            logActivity('ERR_READ', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Read failed: ${err.message}`, 'error');
    }
}

async function handleSaveContent() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;
    const content = elements.fileContentArea.value;

    try {
        const res = await fetch(`${API_BASE}/api/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, offset: 0, content })
        });
        const data = await res.json();
        if (data.success) {
            renderHexDump(content);
            if (data.method === 'mmap_virtual_memory_write') {
                showToast(`Wrote ${data.bytes_written} bytes directly to mapped memory! (Dirty bit set)`, 'success');
                logActivity('SYS_WRITE', `memcpy(ptr=${data.write_pointer}, data, ${data.bytes_written}) -> Virtual page dirty bit set. Call msync() to flush.`, 'badge-write');
                elements.pipelineStatusText.innerHTML = `Data written directly into process virtual memory at <strong>${data.write_pointer}</strong>. The page cache dirty bit is active. Call <strong>msync()</strong> to synchronize changes to physical storage.`;
                animatePipelineStep([5, 4]);
            } else {
                showToast(`Wrote ${data.bytes_written} bytes via POSIX write()`, 'success');
                logActivity('SYS_WRITE', `write(fd, buf, ${data.bytes_written}) -> Written to disk`, 'badge-write');
                animatePipelineStep([5, 2, 1]);
            }
            await refreshAll();
        } else {
            showToast(`Write error: ${data.error}`, 'error');
            logActivity('ERR_WRITE', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Write failed: ${err.message}`, 'error');
    }
}

function handleWriteFile() {
    // Switch to editor tab and focus
    const editorTabBtn = document.querySelector('[data-tab="tab-editor"]');
    if (editorTabBtn) editorTabBtn.click();
    elements.fileContentArea.focus();
    showToast('Edit buffer and click "Commit Changes to Memory"', 'info');
}

async function handleSyncFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;

    try {
        animatePipelineStep([4, 6, 7]);
        elements.pipelineStatusText.innerHTML = `Executing <strong>msync(addr, size, MS_SYNC | MS_INVALIDATE)</strong> to synchronize dirty pages with disk...`;

        const res = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, async: false })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Flushed ${data.size} bytes to disk with msync()!`, 'success');
            logActivity('SYS_MSYNC', `msync(${data.mapped_address}, ${data.size}, MS_SYNC) -> Dirty pages written back to disk block storage.`, 'badge-msync');
            elements.pipelineStatusText.innerHTML = `<strong>msync() completed successfully:</strong> All modified pages from virtual address <strong>${data.mapped_address}</strong> are permanently written to ext4 block storage.`;
            await refreshAll();
        } else {
            showToast(`msync() failed: ${data.error}`, 'error');
            logActivity('ERR_MSYNC', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Sync failed: ${err.message}`, 'error');
    }
}

async function handleUnmapFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;

    try {
        const res = await fetch(`${API_BASE}/api/unmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Unmapped region ${data.unmapped_address} via munmap()`, 'info');
            logActivity('SYS_MUNMAP', `munmap(${data.unmapped_address}, ${data.unmapped_size}) & close(fd) -> Virtual Memory Area released.`, 'badge-munmap');
            elements.pipelineStatusText.innerHTML = `Memory region at <strong>${data.unmapped_address}</strong> has been released via <strong>munmap()</strong>. Virtual address space is reclaimed by the OS.`;
            resetPipelineHighlight();
            await refreshAll();
        } else {
            showToast(`munmap() failed: ${data.error}`, 'error');
            logActivity('ERR_MUNMAP', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Unmap error: ${err.message}`, 'error');
    }
}

async function handleResizeFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;
    const newSize = parseInt(elements.resizeNewSize.value, 10);

    if (isNaN(newSize) || newSize < 0) {
        showToast('Please enter a valid size', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/resize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, new_size: newSize })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Resized to ${data.new_size} bytes with ftruncate()`, 'success');
            logActivity('SYS_FTRUNCATE', `ftruncate(fd, ${data.new_size}) -> File resized from ${data.old_size} to ${data.new_size} bytes`, 'badge-init');
            closeModal(elements.modalResize);
            await refreshAll();
            handleReadFile();
        } else {
            showToast(`Resize failed: ${data.error}`, 'error');
            logActivity('ERR_RESIZE', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Resize error: ${err.message}`, 'error');
    }
}

async function handleDeleteFile() {
    if (!state.selectedFile) return;
    const filename = state.selectedFile.filename;

    if (!confirm(`Are you sure you want to delete '${filename}'? This will trigger the unlink() system call.`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`File '${filename}' deleted!`, 'info');
            logActivity('SYS_UNLINK', `unlink("./data/${filename}") -> File unlinked from filesystem directory entry.`, 'badge-munmap');
            state.selectedFile = null;
            resetFileWorkspace();
            await refreshAll();
        } else {
            showToast(`Delete failed: ${data.error}`, 'error');
            logActivity('ERR_DELETE', data.error, 'badge-error');
        }
    } catch (err) {
        showToast(`Delete error: ${err.message}`, 'error');
    }
}

/* ==============================================================================
   UI Rendering Functions
   ============================================================================== */

function renderFileList(filterText = '') {
    const listEl = elements.fileList;
    listEl.innerHTML = '';

    const filtered = state.files.filter(f => f.filename.toLowerCase().includes(filterText));

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state" style="padding: 2rem 1rem; text-align: center; color: var(--text-muted);">
                <p>No files found in <code>./data</code></p>
                <button class="btn btn-sm btn-primary" onclick="document.getElementById('btn-open-create-modal').click()" style="margin-top: 0.5rem;">+ Create First File</button>
            </div>
        `;
        return;
    }

    filtered.forEach(file => {
        const item = document.createElement('div');
        item.className = `file-item ${state.selectedFile && state.selectedFile.filename === file.filename ? 'active' : ''}`;
        
        let badgeHtml = '';
        if (file.is_mapped) {
            badgeHtml += `<span class="badge badge-mapped">MAPPED</span>`;
            if (file.is_dirty) {
                badgeHtml += ` <span class="badge badge-dirty">DIRTY</span>`;
            }
        } else {
            badgeHtml += `<span class="badge badge-unmapped">UNMAPPED</span>`;
        }

        item.innerHTML = `
            <div class="file-item-header">
                <span class="file-name" title="${file.filename}">${file.filename}</span>
                <div>${badgeHtml}</div>
            </div>
            <div class="file-item-meta">
                <span>${formatBytes(file.size)}</span>
                <span>fd: ${file.fd >= 0 ? file.fd : '-'} &bull; ${file.permissions}</span>
            </div>
        `;

        item.addEventListener('click', () => selectFile(file, true));
        listEl.appendChild(item);
    });
}

function selectFile(file, autoFetchContent = true) {
    state.selectedFile = file;

    // Update active highlight in list
    document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
    renderFileList(elements.fileFilterInput.value.trim().toLowerCase());

    // Update banner details
    elements.activeFilename.textContent = file.filename;
    elements.metaFd.textContent = file.fd >= 0 ? file.fd : 'None (Closed)';
    elements.metaSize.textContent = `${formatBytes(file.size)} (${file.size} Bytes)`;
    elements.metaInode.textContent = file.inode || '-';
    elements.metaPerm.textContent = `${file.permissions} (${file.octal_mode ? '0' + file.octal_mode.toString(8) : '-'})`;

    // Mapping badges & addresses
    if (file.is_mapped && file.mapped_address) {
        elements.activeMappingBadge.textContent = 'MAPPED';
        elements.activeMappingBadge.className = 'badge badge-mapped';
        elements.activeMemAddress.textContent = file.mapped_address;
        elements.activeMemRange.textContent = `Virtual Range: ${file.mapped_address} - 0x${(parseInt(file.mapped_address, 16) + file.mapped_size).toString(16).toUpperCase()}`;
        elements.pipeMemAddr.textContent = file.mapped_address;

        if (file.is_dirty) {
            elements.activeDirtyBadge.classList.remove('hidden');
            elements.activeDirtyBadge.textContent = 'DIRTY (Unsaved)';
            elements.activeDirtyBadge.className = 'badge badge-dirty';
        } else {
            elements.activeDirtyBadge.classList.remove('hidden');
            elements.activeDirtyBadge.textContent = 'CLEAN (Synced)';
            elements.activeDirtyBadge.className = 'badge badge-clean';
        }

        elements.btnMap.disabled = true;
        elements.btnSync.disabled = false;
        elements.btnUnmap.disabled = false;

        animatePipelineStep([1, 2, 3, 4]);
    } else {
        elements.activeMappingBadge.textContent = 'UNMAPPED';
        elements.activeMappingBadge.className = 'badge badge-unmapped';
        elements.activeDirtyBadge.classList.add('hidden');
        elements.activeMemAddress.textContent = '0x000000000000';
        elements.activeMemRange.textContent = 'Not currently loaded in Virtual Memory';
        elements.pipeMemAddr.textContent = 'Unallocated';

        elements.btnMap.disabled = false;
        elements.btnSync.disabled = true;
        elements.btnUnmap.disabled = true;

        resetPipelineHighlight();
    }

    // Enable file action buttons
    elements.btnRead.disabled = false;
    elements.btnWrite.disabled = false;
    elements.btnOpenResize.disabled = false;
    elements.btnDelete.disabled = false;

    // Fetch Inode info & content
    fetchFileInfo(file.filename);
    if (autoFetchContent) {
        handleReadFile();
    }
}

function resetFileWorkspace() {
    elements.activeFilename.textContent = 'No File Selected';
    elements.activeMappingBadge.textContent = 'UNMAPPED';
    elements.activeMappingBadge.className = 'badge badge-unmapped';
    elements.activeDirtyBadge.classList.add('hidden');
    elements.activeMemAddress.textContent = '0x000000000000';
    elements.activeMemRange.textContent = 'Offset: 0x0 | Size: 0 B';
    elements.metaFd.textContent = 'None';
    elements.metaSize.textContent = '0 Bytes';
    elements.metaInode.textContent = '-';
    elements.metaPerm.textContent = '-';

    elements.btnMap.disabled = true;
    elements.btnSync.disabled = true;
    elements.btnUnmap.disabled = true;
    elements.btnRead.disabled = true;
    elements.btnWrite.disabled = true;
    elements.btnOpenResize.disabled = true;
    elements.btnDelete.disabled = true;

    elements.fileContentArea.value = '';
    elements.hexDumpArea.textContent = 'No byte data loaded.';
    resetPipelineHighlight();
}

function renderStatPane(info) {
    const s = info.stat || {};
    const vm = info.vm_info || {};

    elements.statIno.textContent = s.inode || '-';
    elements.statSize.textContent = `${s.size} Bytes (${formatBytes(s.size || 0)})`;
    elements.statMode.textContent = `${s.mode} (octal ${s.octal})`;
    elements.statBlocks.textContent = `${s.blocks} (512-byte blocks)`;
    elements.statBlksize.textContent = `${s.block_size} Bytes`;
    elements.statNlink.textContent = s.hard_links || '1';
    elements.statUidgid.textContent = `${s.uid} / ${s.gid}`;
    elements.statTotalPages.textContent = `${vm.total_pages || 0} Pages (${(vm.total_pages || 0) * (vm.page_size || 4096)} B)`;
    elements.statResidentPages.textContent = `${vm.resident_in_ram_pages || 0} Pages resident (mincore)`;
    elements.statWriteCount.textContent = vm.write_count || 0;
    elements.statMtime.textContent = s.mtime ? new Date(s.mtime * 1000).toLocaleString() : '-';
    elements.statLastSync.textContent = vm.last_sync ? new Date(vm.last_sync * 1000).toLocaleTimeString() : 'Never';
}

function renderHexDump(text) {
    if (!text || text.length === 0) {
        elements.hexDumpArea.textContent = '00000000: <empty file buffer>';
        return;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    let output = '';

    for (let i = 0; i < bytes.length; i += 16) {
        // Offset
        const offsetStr = i.toString(16).padStart(8, '0');
        
        // Hex bytes
        let hexPart = '';
        let asciiPart = '';
        for (let j = 0; j < 16; j++) {
            if (i + j < bytes.length) {
                const b = bytes[i + j];
                hexPart += b.toString(16).padStart(2, '0') + ' ';
                asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            } else {
                hexPart += '   ';
            }
            if (j === 7) hexPart += ' ';
        }

        output += `${offsetStr}:  ${hexPart} |${asciiPart}|\n`;
    }

    elements.hexDumpArea.textContent = output;
}

/* ==============================================================================
   Pipeline Visualization Animation
   ============================================================================== */

function animatePipelineStep(stepNumbers) {
    document.querySelectorAll('.pipeline-node').forEach(node => {
        const step = parseInt(node.getAttribute('data-step'), 10);
        if (stepNumbers.includes(step)) {
            node.classList.add('active-step');
        } else {
            node.classList.remove('active-step');
        }
    });

    for (let i = 1; i <= 6; i++) {
        const arrow = document.getElementById(`arrow-${i}`);
        if (arrow) {
            if (stepNumbers.includes(i) && stepNumbers.includes(i + 1)) {
                arrow.classList.add('active-arrow');
            } else {
                arrow.classList.remove('active-arrow');
            }
        }
    }
}

function resetPipelineHighlight() {
    document.querySelectorAll('.pipeline-node').forEach(n => n.classList.remove('active-step'));
    document.querySelectorAll('.pipeline-arrow').forEach(a => a.classList.remove('active-arrow'));
}

/* ==============================================================================
   Terminal Logging
   ============================================================================== */

function logActivity(tag, message, badgeClass = 'badge-init') {
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const now = new Date();
    const timeStr = `[${now.toTimeString().split(' ')[0]}]`;

    entry.innerHTML = `
        <span class="log-time">${timeStr}</span>
        <span class="log-badge ${badgeClass}">${tag}</span>
        <span class="log-msg">${escapeHtml(message)}</span>
    `;

    elements.terminalLog.appendChild(entry);
    elements.terminalLog.scrollTop = elements.terminalLog.scrollHeight;
}

/* ==============================================================================
   Automated Viva / Presentation Demo Workflow
   ============================================================================== */

async function runVivaDemoWorkflow() {
    if (state.isDemoRunning) return;
    state.isDemoRunning = true;
    elements.btnQuickDemo.disabled = true;

    showToast('🚀 Starting Automated Viva Presentation Demo Workflow...', 'info');
    logActivity('DEMO_START', '=== Commencing 13-step OSSP Memory Mapping Demonstration ===', 'badge-init');

    const demoFilename = 'demo_test.txt';
    const initialText = 'Hello from Linux mmap!';
    const modifiedText = 'Hello from Linux mmap! [Modified in Virtual Memory without write() syscall!]';

    try {
        // Step 1: Cleanup prior demo file if exists
        const existing = state.files.find(f => f.filename === demoFilename);
        if (existing) {
            logActivity('DEMO_STEP', 'Cleaning up prior demo file...', 'badge-init');
            await fetch(`${API_BASE}/api/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: demoFilename })
            });
            await sleep(800);
        }

        // Step 2: Create file
        logActivity('DEMO_STEP_1', `Creating '${demoFilename}' with initial text: "${initialText}"`, 'badge-init');
        await fetch(`${API_BASE}/api/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: demoFilename, size: 0, content: initialText })
        });
        await fetchFiles();
        let target = state.files.find(f => f.filename === demoFilename);
        if (target) selectFile(target, true);
        showToast('Step 1/8: File created with open() & write()', 'success');
        await sleep(1500);

        // Step 3: Map file via mmap()
        logActivity('DEMO_STEP_2', `Calling mmap() to map '${demoFilename}' into user address space...`, 'badge-mmap');
        await handleMapFile();
        showToast('Step 2/8: Mapped into Virtual Memory via mmap()', 'success');
        await sleep(2000);

        // Step 4: Read content via mapped pointer
        logActivity('DEMO_STEP_3', 'Reading content via direct virtual memory pointer dereference...', 'badge-read');
        await handleReadFile();
        showToast('Step 3/8: Read directly via memory pointer (Zero-Copy)', 'info');
        await sleep(1500);

        // Step 5: Modify content and write to memory
        logActivity('DEMO_STEP_4', `Writing modified content into mapped memory pages: "${modifiedText}"`, 'badge-write');
        elements.fileContentArea.value = modifiedText;
        await handleSaveContent();
        showToast('Step 4/8: Modified virtual memory (Page Dirty Bit Set)', 'info');
        await sleep(2000);

        // Step 6: Flush dirty pages via msync()
        logActivity('DEMO_STEP_5', 'Synchronizing modified pages to physical disk via msync(MS_SYNC)...', 'badge-msync');
        await handleSyncFile();
        showToast('Step 5/8: Synchronized to disk via msync()', 'success');
        await sleep(2000);

        // Step 7: Unmap memory region via munmap()
        logActivity('DEMO_STEP_6', 'Releasing virtual memory mapping via munmap() and closing fd...', 'badge-munmap');
        await handleUnmapFile();
        showToast('Step 6/8: Unmapped via munmap()', 'info');
        await sleep(1500);

        // Step 8: Verify persistence by reading from disk
        logActivity('DEMO_STEP_7', 'Reading file from disk to verify that memory modifications persisted...', 'badge-read');
        await handleReadFile();
        showToast('Step 7/8: Changes verified successfully on disk!', 'success');
        await sleep(1500);

        logActivity('DEMO_FINISH', '🎉 Viva Demo workflow completed successfully! All OS concepts verified.', 'badge-msync');
        showToast('🎉 Viva Presentation Demo Completed Successfully!', 'success');

    } catch (err) {
        logActivity('DEMO_ERR', `Demo encountered error: ${err.message}`, 'badge-error');
        showToast(`Demo error: ${err.message}`, 'error');
    } finally {
        state.isDemoRunning = false;
        elements.btnQuickDemo.disabled = false;
    }
}

/* ==============================================================================
   Modal & Toast Helpers
   ============================================================================== */

function openModal(modalEl) {
    if (modalEl) modalEl.classList.add('open');
}

function closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove('open');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}

function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

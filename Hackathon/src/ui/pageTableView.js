/**
 * Page Table Explorer View
 * Interactive inspection of Single-Level, Two-Level Hierarchical (Page Directory + Inner Tables),
 * and Inverted Page Tables with filter and search capabilities.
 */

export class PageTableView {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;
    this.filterOnlyResident = false;
    this.searchTerm = '';
    this.selectedP1Directory = 0;

    this.renderLayout();
    this.attachEvents();
    this.updateView();

    this.simulator.subscribe((event, data) => {
      if (event === 'step' || event === 'reset' || event === 'configChange') {
        this.updateView(data);
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="view-header-bar">
        <div class="view-stat-chips">
          <div class="stat-chip">
            <span class="label">Paging Mode:</span>
            <strong class="val text-accent" id="pt-stat-mode">Single-Level</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Page Hits:</span>
            <strong class="val text-success" id="pt-stat-hits">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Page Faults:</span>
            <strong class="val text-danger" id="pt-stat-faults">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Fault Rate:</span>
            <strong class="val" id="pt-stat-faultrate">0.0%</strong>
          </div>
        </div>

        <div class="view-actions">
          <select id="sel-pt-mode" class="yaru-select yaru-select-sm">
            <option value="single" selected>Single-Level</option>
            <option value="two-level">Two-Level Hierarchical</option>
            <option value="inverted">Inverted Page Table</option>
          </select>
        </div>
      </div>

      <!-- Filter and Search Toolbar -->
      <div class="pt-filter-bar">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" id="pt-search-input" placeholder="Filter by VPN (e.g. 0x06)..." class="yaru-input-sm" />
        </div>

        <label class="checkbox-label">
          <input type="checkbox" id="chk-only-resident" />
          <span>Resident in RAM only (Present=1)</span>
        </label>
      </div>

      <!-- Dynamic Mode Container -->
      <div id="pt-content-area" class="pt-content-area">
        <!-- Rendered based on selected mode -->
      </div>
    `;
  }

  attachEvents() {
    const modeSel = this.container.querySelector('#sel-pt-mode');
    const searchInput = this.container.querySelector('#pt-search-input');
    const residentChk = this.container.querySelector('#chk-only-resident');

    modeSel.addEventListener('change', () => {
      this.simulator.updateConfiguration({ pagingType: modeSel.value });
    });

    searchInput.addEventListener('input', () => {
      this.searchTerm = searchInput.value.trim().toLowerCase();
      this.updateView();
    });

    residentChk.addEventListener('change', () => {
      this.filterOnlyResident = residentChk.checked;
      this.updateView();
    });
  }

  updateView(stepResult = null) {
    const mode = this.simulator.config.pagingType;
    const stats = this.simulator.pageTable.getStats();

    this.container.querySelector('#pt-stat-mode').textContent = 
      mode === 'two-level' ? 'Two-Level (P1 + P2)' : (mode === 'inverted' ? 'Inverted (Frame-Indexed)' : 'Single-Level');
    this.container.querySelector('#pt-stat-hits').textContent = stats.pageHits;
    this.container.querySelector('#pt-stat-faults').textContent = stats.pageFaults;
    this.container.querySelector('#pt-stat-faultrate').textContent = `${stats.pageFaultRate.toFixed(2)}%`;
    this.container.querySelector('#sel-pt-mode').value = mode;

    const contentArea = this.container.querySelector('#pt-content-area');

    if (mode === 'two-level') {
      this.renderTwoLevelView(contentArea, stepResult);
    } else if (mode === 'inverted') {
      this.renderInvertedView(contentArea, stepResult);
    } else {
      this.renderSingleLevelView(contentArea, stepResult);
    }
  }

  renderSingleLevelView(container, stepResult) {
    const table = this.simulator.pageTable.singleTable;
    let filtered = table;

    if (this.filterOnlyResident) {
      filtered = filtered.filter(pte => pte.present);
    }

    if (this.searchTerm) {
      filtered = filtered.filter(pte => {
        const hex = '0x' + pte.vpn.toString(16).toLowerCase();
        return hex.includes(this.searchTerm) || pte.vpn.toString().includes(this.searchTerm);
      });
    }

    container.innerHTML = `
      <div class="table-scroll-wrapper">
        <table class="yaru-table pt-table">
          <thead>
            <tr>
              <th>VPN</th>
              <th>VPN (Hex)</th>
              <th>Present Bit</th>
              <th>Frame #</th>
              <th>Dirty Bit</th>
              <th>Reference Bit</th>
              <th>Protection</th>
              <th>Secondary Swap Block</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(pte => {
              const isCurrent = stepResult && stepResult.logicalAddress.vpn === pte.vpn;
              let rowClass = isCurrent ? (pte.present ? 'row-pt-hit' : 'row-pt-fault') : '';

              return `
                <tr class="${rowClass}">
                  <td class="mono-bold">${pte.vpn}</td>
                  <td class="mono-bold text-accent">0x${pte.vpn.toString(16).toUpperCase().padStart(2, '0')}</td>
                  <td>
                    <span class="status-indicator ${pte.present ? 'status-valid' : 'status-invalid'}">
                      ${pte.present ? '1 (In RAM)' : '0 (On Disk)'}
                    </span>
                  </td>
                  <td class="mono-bold text-highlight">
                    ${pte.present ? `Frame #${pte.frame}` : '<span class="text-muted">--</span>'}
                  </td>
                  <td>
                    <span class="bit-badge ${pte.dirty ? 'bit-dirty' : 'bit-clean'}">
                      ${pte.dirty ? '1 (Dirty)' : '0'}
                    </span>
                  </td>
                  <td>
                    <span class="bit-badge ${pte.referenced ? 'bit-ref' : 'bit-noref'}">
                      ${pte.referenced ? '1' : '0'}
                    </span>
                  </td>
                  <td>${pte.readOnly ? 'Read Only' : 'Read/Write'}</td>
                  <td>
                    ${pte.swapBlock !== null ? `<span class="badge badge-swap">Swap #${pte.swapBlock}</span>` : '<span class="text-muted">None</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderTwoLevelView(container, stepResult) {
    const dir = this.simulator.pageTable.pageDirectory;
    const currentP1 = stepResult ? stepResult.logicalAddress.outerIndex : this.selectedP1Directory;

    container.innerHTML = `
      <div class="two-level-grid">
        <!-- Level 1: Page Directory -->
        <div class="level-column">
          <div class="column-header">
            <span>Level 1: Page Directory (P1)</span>
            <span class="badge badge-neutral">${dir.length} Entries</span>
          </div>
          <div class="directory-list">
            ${dir.map((entry, idx) => `
              <div class="directory-item ${entry.allocated ? 'is-allocated' : 'not-allocated'} ${idx === this.selectedP1Directory ? 'active-p1' : ''}" data-p1="${idx}">
                <div class="dir-index">P1 Index: <strong>${idx}</strong> (0x${idx.toString(16).toUpperCase()})</div>
                <div class="dir-status">
                  ${entry.allocated ? '<span class="text-success">● Allocated Table</span>' : '<span class="text-muted">○ Not Allocated (0 B)</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Level 2: Inner Page Table -->
        <div class="level-column level-inner-table">
          <div class="column-header">
            <span>Level 2: Inner Table for P1 [${this.selectedP1Directory}]</span>
            <span class="badge badge-neutral">${dir[this.selectedP1Directory]?.allocated ? 'Active' : 'Unallocated'}</span>
          </div>
          <div class="table-scroll-wrapper">
            ${dir[this.selectedP1Directory]?.allocated ? `
              <table class="yaru-table pt-table">
                <thead>
                  <tr>
                    <th>P2 Index</th>
                    <th>VPN</th>
                    <th>Present</th>
                    <th>Frame #</th>
                    <th>Dirty</th>
                    <th>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  ${dir[this.selectedP1Directory].table.map(pte => `
                    <tr class="${stepResult && stepResult.logicalAddress.vpn === pte.vpn ? 'row-pt-hit' : ''}">
                      <td class="mono-bold">${pte.p2}</td>
                      <td class="mono-bold text-accent">0x${pte.vpn.toString(16).toUpperCase()}</td>
                      <td>
                        <span class="status-indicator ${pte.present ? 'status-valid' : 'status-invalid'}">
                          ${pte.present ? '1' : '0'}
                        </span>
                      </td>
                      <td class="mono-bold text-highlight">${pte.present ? '#' + pte.frame : '--'}</td>
                      <td>${pte.dirty ? '1' : '0'}</td>
                      <td>${pte.referenced ? '1' : '0'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div class="empty-state">
                <span class="empty-icon">📁</span>
                <p>Inner Page Table not yet allocated in physical memory.</p>
                <small class="text-muted">In hierarchical paging, unmapped virtual memory incurs zero page table memory overhead!</small>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Click handler to select P1 directory entry
    container.querySelectorAll('.directory-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedP1Directory = parseInt(item.dataset.p1, 10);
        this.renderTwoLevelView(container, stepResult);
      });
    });
  }

  renderInvertedView(container, stepResult) {
    const table = this.simulator.pageTable.invertedTable;

    container.innerHTML = `
      <div class="inverted-intro-card">
        <strong>Inverted Page Table (Frame-Indexed):</strong> Exactly 1 entry per physical frame (${table.length} entries).
        Eliminates per-process page table size explosion in 64-bit architectures!
      </div>
      <div class="table-scroll-wrapper">
        <table class="yaru-table pt-table">
          <thead>
            <tr>
              <th>Frame #</th>
              <th>Valid</th>
              <th>PID (Owner)</th>
              <th>Virtual Page (VPN)</th>
              <th>Dirty Bit</th>
              <th>Ref Bit</th>
            </tr>
          </thead>
          <tbody>
            ${table.map(entry => {
              const isHit = stepResult && stepResult.frame === entry.frame;
              return `
                <tr class="${isHit ? 'row-pt-hit' : ''}">
                  <td class="mono-bold text-highlight">Frame #${entry.frame}</td>
                  <td>
                    <span class="status-indicator ${entry.valid ? 'status-valid' : 'status-invalid'}">
                      ${entry.valid ? '1 (Mapped)' : '0 (Free)'}
                    </span>
                  </td>
                  <td>${entry.valid ? `PID ${entry.pid}` : '--'}</td>
                  <td class="mono-bold text-accent">${entry.valid ? '0x' + entry.vpn.toString(16).toUpperCase() : '--'}</td>
                  <td>${entry.dirty ? '1' : '0'}</td>
                  <td>${entry.referenced ? '1' : '0'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

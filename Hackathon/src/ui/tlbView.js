/**
 * TLB Cache Inspector View
 * Real-time table display of TLB entries, associativity sets, replacement metadata,
 * hit/miss status highlighting, and dynamic cache controls.
 */

import { sound } from './audio.js';

export class TLBView {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;

    this.renderLayout();
    this.attachEvents();
    this.updateEntries();

    this.simulator.subscribe((event, data) => {
      if (event === 'step' || event === 'reset' || event === 'configChange') {
        this.updateEntries(data);
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="view-header-bar">
        <div class="view-stat-chips">
          <div class="stat-chip">
            <span class="label">Hit Ratio:</span>
            <strong class="val text-success" id="tlb-stat-hitrate">0.0%</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Hits:</span>
            <strong class="val" id="tlb-stat-hits">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Misses:</span>
            <strong class="val text-warning" id="tlb-stat-misses">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Evictions:</span>
            <strong class="val text-danger" id="tlb-stat-evictions">0</strong>
          </div>
        </div>

        <div class="view-actions">
          <button id="btn-tlb-flush" class="yaru-btn yaru-btn-sm yaru-btn-danger" title="Invalidate all TLB entries">
            <span class="btn-icon">🧹</span> Flush TLB
          </button>
        </div>
      </div>

      <!-- Quick Configuration Bar -->
      <div class="tlb-quick-config">
        <div class="config-item">
          <label>Policy:</label>
          <select id="sel-tlb-policy" class="yaru-select yaru-select-sm">
            <option value="LRU" selected>LRU</option>
            <option value="FIFO">FIFO</option>
            <option value="Clock">Clock (Second Chance)</option>
            <option value="LFU">LFU</option>
            <option value="Random">Random</option>
          </select>
        </div>

        <div class="config-item">
          <label>Associativity:</label>
          <select id="sel-tlb-assoc" class="yaru-select yaru-select-sm">
            <option value="fully" selected>Fully Associative</option>
            <option value="2-way">2-Way Set Assoc</option>
            <option value="4-way">4-Way Set Assoc</option>
          </select>
        </div>

        <div class="config-item">
          <label>Size:</label>
          <select id="sel-tlb-size" class="yaru-select yaru-select-sm">
            <option value="4">4 Entries</option>
            <option value="8" selected>8 Entries</option>
            <option value="16">16 Entries</option>
            <option value="32">32 Entries</option>
          </select>
        </div>
      </div>

      <!-- TLB Entries Table -->
      <div class="table-scroll-wrapper">
        <table class="yaru-table tlb-table">
          <thead>
            <tr>
              <th>Index</th>
              <th>Set</th>
              <th>Valid</th>
              <th>Tag (VPN)</th>
              <th>Frame #</th>
              <th>ASID / PID</th>
              <th>Dirty</th>
              <th>Ref</th>
              <th>Usage Metric</th>
            </tr>
          </thead>
          <tbody id="tlb-entries-body">
            <!-- Dynamic rows -->
          </tbody>
        </table>
      </div>
      <div class="view-footer-note">
        <span class="hint-icon">💡</span>
        <span>CAM (Content Addressable Memory) compares all tags in parallel within 1 CPU cycle (${this.simulator.config.tlbLatency} ns).</span>
      </div>
    `;
  }

  attachEvents() {
    const flushBtn = this.container.querySelector('#btn-tlb-flush');
    const policySel = this.container.querySelector('#sel-tlb-policy');
    const assocSel = this.container.querySelector('#sel-tlb-assoc');
    const sizeSel = this.container.querySelector('#sel-tlb-size');

    flushBtn.addEventListener('click', () => {
      sound.playStep();
      this.simulator.tlb.flush();
      this.updateEntries();
    });

    policySel.addEventListener('change', () => {
      this.simulator.updateConfiguration({ tlbPolicy: policySel.value });
    });

    assocSel.addEventListener('change', () => {
      this.simulator.updateConfiguration({ tlbAssociativity: assocSel.value });
    });

    sizeSel.addEventListener('change', () => {
      this.simulator.updateConfiguration({ tlbSize: parseInt(sizeSel.value, 10) });
    });
  }

  updateEntries(stepResult = null) {
    const entries = this.simulator.tlb.getEntries();
    const stats = this.simulator.tlb.getStats();

    // Update Stats
    this.container.querySelector('#tlb-stat-hitrate').textContent = `${stats.hitRate.toFixed(1)}%`;
    this.container.querySelector('#tlb-stat-hits').textContent = stats.hits;
    this.container.querySelector('#tlb-stat-misses').textContent = stats.misses;
    this.container.querySelector('#tlb-stat-evictions').textContent = stats.evictions;

    // Sync select dropdowns with current config
    this.container.querySelector('#sel-tlb-policy').value = this.simulator.config.tlbPolicy;
    this.container.querySelector('#sel-tlb-assoc').value = this.simulator.config.tlbAssociativity;
    this.container.querySelector('#sel-tlb-size').value = this.simulator.config.tlbSize;

    const tbody = this.container.querySelector('#tlb-entries-body');
    tbody.innerHTML = '';

    const ways = this.simulator.tlb.ways;

    entries.forEach((entry, idx) => {
      const setIdx = Math.floor(idx / ways);
      const isHit = stepResult && stepResult.tlbHit && stepResult.logicalAddress.vpn === entry.tag && entry.valid;
      const isEvicted = stepResult && stepResult.tlbEvicted && stepResult.tlbEvicted.index === idx;

      let rowClass = '';
      if (isHit) rowClass = 'row-tlb-hit';
      else if (isEvicted) rowClass = 'row-tlb-evicted';

      const tr = document.createElement('tr');
      tr.className = rowClass;

      let metricStr = '--';
      if (this.simulator.config.tlbPolicy === 'LRU') {
        metricStr = entry.valid ? `Age: ${this.simulator.tlb.timeCounter - entry.lastAccessTime}` : '--';
      } else if (this.simulator.config.tlbPolicy === 'FIFO') {
        metricStr = entry.valid ? `Loaded: #${entry.insertionTime}` : '--';
      } else if (this.simulator.config.tlbPolicy === 'LFU') {
        metricStr = entry.valid ? `Count: ${entry.accessCount}` : '--';
      } else if (this.simulator.config.tlbPolicy === 'Clock') {
        metricStr = entry.valid ? (idx === (this.simulator.tlb.clockHand % this.simulator.tlb.size) ? '👉 Hand' : 'Pending') : '--';
      }

      tr.innerHTML = `
        <td class="col-index">#${entry.index}</td>
        <td class="col-set">${this.simulator.config.tlbAssociativity === 'fully' ? 'Global' : `Set ${setIdx}`}</td>
        <td>
          <span class="status-indicator ${entry.valid ? 'status-valid' : 'status-invalid'}">
            ${entry.valid ? '1 (Valid)' : '0 (Empty)'}
          </span>
        </td>
        <td class="mono-bold text-accent">
          ${entry.valid ? '0x' + entry.tag.toString(16).toUpperCase().padStart(2, '0') : '--'}
        </td>
        <td class="mono-bold text-highlight">
          ${entry.valid ? `Frame #${entry.frame}` : '--'}
        </td>
        <td>${entry.valid ? `PID ${entry.pid}` : '--'}</td>
        <td>
          <span class="bit-badge ${entry.dirty ? 'bit-dirty' : 'bit-clean'}">
            ${entry.dirty ? '1 (Dirty)' : '0'}
          </span>
        </td>
        <td>
          <span class="bit-badge ${entry.ref ? 'bit-ref' : 'bit-noref'}">
            ${entry.ref ? '1' : '0'}
          </span>
        </td>
        <td class="col-metric">${metricStr}</td>
      `;

      tbody.appendChild(tr);
    });
  }
}

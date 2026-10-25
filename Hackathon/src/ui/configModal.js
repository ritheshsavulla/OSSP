/**
 * Hardware Architecture Configuration Window
 * Allows comprehensive customization of address bit widths, page sizes, RAM capacity,
 * multi-level paging schemes, TLB parameters, replacement policies, and latency timings.
 */

import { sound } from './audio.js';

export class ConfigModal {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;

    this.renderLayout();
    this.attachEvents();
    this.syncFormWithConfig();

    this.simulator.subscribe((event) => {
      if (event === 'configChange') {
        this.syncFormWithConfig();
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="config-modal-content">
        <div class="config-grid">
          
          <!-- Column 1: Virtual & Physical Memory Dimensions -->
          <div class="config-section">
            <div class="section-title">
              <span>🖥 Memory Geometry & Sizing</span>
            </div>

            <div class="form-group">
              <label for="cfg-addr-bits">Virtual Address Space:</label>
              <select id="cfg-addr-bits" class="yaru-select">
                <option value="16" selected>16-bit (64 KB Virtual Memory)</option>
                <option value="32">32-bit (4 GB Virtual Memory)</option>
              </select>
              <small class="field-help">Determines total virtual addressable space.</small>
            </div>

            <div class="form-group">
              <label for="cfg-page-size">Page Size (Frame Size):</label>
              <select id="cfg-page-size" class="yaru-select">
                <option value="256">256 Bytes (8-bit Offset)</option>
                <option value="512">512 Bytes (9-bit Offset)</option>
                <option value="1024" selected>1 KB (10-bit Offset)</option>
                <option value="2048">2 KB (11-bit Offset)</option>
                <option value="4096">4 KB (12-bit Offset - Standard x86)</option>
              </select>
              <small class="field-help">Power-of-2 size of each virtual page and physical frame.</small>
            </div>

            <div class="form-group">
              <label for="cfg-ram-size">Physical RAM Capacity:</label>
              <select id="cfg-ram-size" class="yaru-select">
                <option value="8192">8 KB RAM</option>
                <option value="16384" selected>16 KB RAM (16 Frames @ 1KB)</option>
                <option value="32768">32 KB RAM</option>
                <option value="65536">64 KB RAM</option>
              </select>
              <small class="field-help">Total installed main memory available for resident pages.</small>
            </div>

            <div class="form-group">
              <label for="cfg-paging-type">Paging Scheme:</label>
              <select id="cfg-paging-type" class="yaru-select">
                <option value="single" selected>Single-Level Page Table</option>
                <option value="two-level">Two-Level Hierarchical Paging (P1 + P2)</option>
                <option value="inverted">Inverted Page Table (Frame-Indexed)</option>
              </select>
            </div>
          </div>

          <!-- Column 2: TLB & Replacement Policies -->
          <div class="config-section">
            <div class="section-title">
              <span>⚡ TLB & Replacement Algorithms</span>
            </div>

            <div class="form-group">
              <label for="cfg-tlb-size">TLB Capacity (Entries):</label>
              <select id="cfg-tlb-size" class="yaru-select">
                <option value="4">4 Entries (Small Micro-TLB)</option>
                <option value="8" selected>8 Entries</option>
                <option value="16">16 Entries</option>
                <option value="32">32 Entries</option>
              </select>
            </div>

            <div class="form-group">
              <label for="cfg-tlb-assoc">TLB Associativity:</label>
              <select id="cfg-tlb-assoc" class="yaru-select">
                <option value="fully" selected>Fully Associative (CAM)</option>
                <option value="2-way">2-Way Set Associative</option>
                <option value="4-way">4-Way Set Associative</option>
              </select>
            </div>

            <div class="form-group">
              <label for="cfg-tlb-policy">TLB Replacement Policy:</label>
              <select id="cfg-tlb-policy" class="yaru-select">
                <option value="LRU" selected>LRU (Least Recently Used)</option>
                <option value="FIFO">FIFO (First-In, First-Out)</option>
                <option value="Clock">Clock (Second Chance)</option>
                <option value="LFU">LFU (Least Frequently Used)</option>
                <option value="Random">Random Replacement</option>
              </select>
            </div>

            <div class="form-group">
              <label for="cfg-mem-policy">RAM Page Replacement Policy:</label>
              <select id="cfg-mem-policy" class="yaru-select">
                <option value="LRU" selected>LRU (Least Recently Used)</option>
                <option value="FIFO">FIFO (First-In, First-Out)</option>
                <option value="Clock">Clock (Second Chance)</option>
                <option value="Optimal">Optimal (Belady's MIN)</option>
                <option value="Random">Random Replacement</option>
              </select>
            </div>
          </div>

          <!-- Column 3: Hardware Timings & Geometry Breakdown -->
          <div class="config-section">
            <div class="section-title">
              <span>⏱ Latency Timings (ns & ms)</span>
            </div>

            <div class="form-group">
              <label for="cfg-tlb-latency">TLB Lookup Time (ns):</label>
              <input type="number" id="cfg-tlb-latency" value="1" min="0.5" max="20" step="0.5" class="yaru-input" />
            </div>

            <div class="form-group">
              <label for="cfg-ram-latency">RAM Access Time (ns):</label>
              <input type="number" id="cfg-ram-latency" value="100" min="10" max="500" step="5" class="yaru-input" />
            </div>

            <div class="form-group">
              <label for="cfg-fault-latency">Page Fault Service Penalty (ms):</label>
              <input type="number" id="cfg-fault-latency" value="8" min="1" max="50" step="1" class="yaru-input" />
            </div>

            <!-- Architectural Breakdown Summary Card -->
            <div class="geometry-summary-box">
              <div class="summary-header">📐 Architectural Geometry Breakdown</div>
              <div class="summary-line">VPN Bits: <strong id="geo-vpn-bits">6 bits</strong> | Offset Bits: <strong id="geo-offset-bits">10 bits</strong></div>
              <div class="summary-line">Virtual Pages: <strong id="geo-num-pages">64 Pages</strong></div>
              <div class="summary-line">Physical Frames: <strong id="geo-num-frames">16 Frames</strong></div>
              <div class="summary-line" id="geo-twolevel-line">Outer P1: <strong>3 bits</strong> | Inner P2: <strong>3 bits</strong></div>
            </div>
          </div>

        </div>

        <div class="config-modal-footer">
          <button id="btn-reset-defaults" class="yaru-btn yaru-btn-neutral">Reset Defaults</button>
          <button id="btn-apply-config" class="yaru-btn yaru-btn-primary">⚡ Apply Configuration & Re-initialize</button>
        </div>
      </div>
    `;
  }

  attachEvents() {
    const applyBtn = this.container.querySelector('#btn-apply-config');
    const resetBtn = this.container.querySelector('#btn-reset-defaults');

    applyBtn.addEventListener('click', () => {
      sound.playStep();
      const newConfig = {
        addressBits: parseInt(this.container.querySelector('#cfg-addr-bits').value, 10),
        pageSize: parseInt(this.container.querySelector('#cfg-page-size').value, 10),
        ramSize: parseInt(this.container.querySelector('#cfg-ram-size').value, 10),
        pagingType: this.container.querySelector('#cfg-paging-type').value,
        tlbSize: parseInt(this.container.querySelector('#cfg-tlb-size').value, 10),
        tlbAssociativity: this.container.querySelector('#cfg-tlb-assoc').value,
        tlbPolicy: this.container.querySelector('#cfg-tlb-policy').value,
        memPolicy: this.container.querySelector('#cfg-mem-policy').value,
        tlbLatency: parseFloat(this.container.querySelector('#cfg-tlb-latency').value),
        ramLatency: parseFloat(this.container.querySelector('#cfg-ram-latency').value),
        pageFaultLatency: parseFloat(this.container.querySelector('#cfg-fault-latency').value) * 1000000, // convert ms to ns
      };

      this.simulator.updateConfiguration(newConfig);
      this.syncFormWithConfig();
    });

    resetBtn.addEventListener('click', () => {
      sound.playStep();
      this.simulator.updateConfiguration({
        addressBits: 16,
        pageSize: 1024,
        ramSize: 16384,
        pagingType: 'single',
        tlbSize: 8,
        tlbAssociativity: 'fully',
        tlbPolicy: 'LRU',
        memPolicy: 'LRU',
        tlbLatency: 1,
        ramLatency: 100,
        pageFaultLatency: 8000000,
      });
      this.syncFormWithConfig();
    });

    // Dynamic geometry recalculation when dropdowns change
    const inputs = this.container.querySelectorAll('select, input');
    inputs.forEach(inp => {
      inp.addEventListener('change', () => this.previewGeometry());
    });
  }

  syncFormWithConfig() {
    const cfg = this.simulator.config;
    this.container.querySelector('#cfg-addr-bits').value = cfg.addressBits;
    this.container.querySelector('#cfg-page-size').value = cfg.pageSize;
    this.container.querySelector('#cfg-ram-size').value = cfg.ramSize;
    this.container.querySelector('#cfg-paging-type').value = cfg.pagingType;
    this.container.querySelector('#cfg-tlb-size').value = cfg.tlbSize;
    this.container.querySelector('#cfg-tlb-assoc').value = cfg.tlbAssociativity;
    this.container.querySelector('#cfg-tlb-policy').value = cfg.tlbPolicy;
    this.container.querySelector('#cfg-mem-policy').value = cfg.memPolicy;
    this.container.querySelector('#cfg-tlb-latency').value = cfg.tlbLatency;
    this.container.querySelector('#cfg-ram-latency').value = cfg.ramLatency;
    this.container.querySelector('#cfg-fault-latency').value = cfg.pageFaultLatency / 1000000;

    this.previewGeometry();
  }

  previewGeometry() {
    const addrBits = parseInt(this.container.querySelector('#cfg-addr-bits').value, 10);
    const pageSize = parseInt(this.container.querySelector('#cfg-page-size').value, 10);
    const ramSize = parseInt(this.container.querySelector('#cfg-ram-size').value, 10);
    const offsetBits = Math.round(Math.log2(pageSize));
    const vpnBits = addrBits - offsetBits;
    const numPages = 1 << vpnBits;
    const numFrames = Math.floor(ramSize / pageSize);

    this.container.querySelector('#geo-vpn-bits').textContent = `${vpnBits} bits`;
    this.container.querySelector('#geo-offset-bits').textContent = `${offsetBits} bits`;
    this.container.querySelector('#geo-num-pages').textContent = `${numPages.toLocaleString()} Pages`;
    this.container.querySelector('#geo-num-frames').textContent = `${numFrames} Frames`;

    const twoLevelLine = this.container.querySelector('#geo-twolevel-line');
    if (this.container.querySelector('#cfg-paging-type').value === 'two-level') {
      const p1 = Math.floor(vpnBits / 2) || 1;
      const p2 = vpnBits - p1;
      twoLevelLine.style.display = 'block';
      twoLevelLine.innerHTML = `Outer P1: <strong>${p1} bits (${1 << p1} dirs)</strong> | Inner P2: <strong>${p2} bits (${1 << p2} PTEs)</strong>`;
    } else {
      twoLevelLine.style.display = 'none';
    }
  }
}

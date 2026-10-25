/**
 * Workload Studio & Trace Generator View
 * Presets for spatial locality, temporal locality, matrix multiplication stride,
 * thrashing, multi-process interleaving, and custom trace import/export.
 */

import { sound } from './audio.js';
import confetti from 'canvas-confetti';

export class WorkloadsView {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;

    this.renderLayout();
    this.attachEvents();
    this.updateTraceList();

    this.simulator.subscribe((event, data) => {
      if (event === 'traceLoaded' || event === 'step' || event === 'reset') {
        this.updateTraceList();
      } else if (event === 'traceFinished') {
        this.onTraceCompleted();
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="workloads-container">
        <!-- Preset Cards Selection Grid -->
        <div class="section-title">
          <span>Standard OS Benchmark Presets</span>
          <span class="badge badge-accent">1-Click Scenarios</span>
        </div>

        <div class="presets-grid">
          <div class="preset-card" data-preset="loop">
            <div class="preset-icon">🔁</div>
            <div class="preset-info">
              <div class="preset-title">Temporal Locality (Tight Loop)</div>
              <div class="preset-desc">Working set fits in TLB. Hits quickly ramp up to ~95%+. Demonstrates cache locality.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-primary btn-load-preset">Load</button>
          </div>

          <div class="preset-card" data-preset="seq">
            <div class="preset-icon">📈</div>
            <div class="preset-info">
              <div class="preset-title">Spatial Locality (Array Scan)</div>
              <div class="preset-desc">Sequential stride across 4 KB buffer. 1 initial page fault per page, then 100% TLB hits.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-primary btn-load-preset">Load</button>
          </div>

          <div class="preset-card" data-preset="matrix">
            <div class="preset-icon">🧮</div>
            <div class="preset-info">
              <div class="preset-title">Matrix Stride (Col-Major)</div>
              <div class="preset-desc">Jumps across page boundaries on every step. High TLB misses and replacement thrashing.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-primary btn-load-preset">Load</button>
          </div>

          <div class="preset-card" data-preset="thrash">
            <div class="preset-icon">⚠️</div>
            <div class="preset-info">
              <div class="preset-title">OS Thrashing Scenario</div>
              <div class="preset-desc">Working set (18 pages) exceeds RAM capacity (16 frames). Constant page faults & swap I/O.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-danger btn-load-preset">Load</button>
          </div>

          <div class="preset-card" data-preset="multiproc">
            <div class="preset-icon">👥</div>
            <div class="preset-info">
              <div class="preset-title">Multi-Process Context Switching</div>
              <div class="preset-desc">Interleaves PID 1 and PID 2 memory spaces, demonstrating ASID tagging protection.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-primary btn-load-preset">Load</button>
          </div>

          <div class="preset-card" data-preset="rand">
            <div class="preset-icon">🎲</div>
            <div class="preset-info">
              <div class="preset-title">Random Memory Probes</div>
              <div class="preset-desc">Uniformly distributed random addresses across space. Tests replacement policy efficiency.</div>
            </div>
            <button class="yaru-btn yaru-btn-sm yaru-btn-primary btn-load-preset">Load</button>
          </div>
        </div>

        <!-- Custom Trace Script Editor & Active Trace Table -->
        <div class="trace-dual-pane">
          <!-- Left: Trace Table -->
          <div class="trace-table-pane">
            <div class="pane-header">
              <span>Active Trace Queue (<span id="trace-progress-count">0 / 0</span>)</span>
              <button id="btn-run-loaded-trace" class="yaru-btn yaru-btn-sm yaru-btn-play">
                <span class="btn-icon">▶</span> Execute
              </button>
            </div>
            <div class="table-scroll-wrapper trace-table-wrapper">
              <table class="yaru-table trace-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Address</th>
                    <th>VPN</th>
                    <th>Op</th>
                    <th>PID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="trace-table-body">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right: Custom Script Editor -->
          <div class="trace-editor-pane">
            <div class="pane-header">
              <span>Custom Trace Script Editor</span>
              <div class="editor-header-actions">
                <input type="file" id="trace-file-input" accept=".txt,.trace" style="display: none;" />
                <button id="btn-import-trace" class="yaru-btn yaru-btn-sm" title="Import trace file">📂 Import</button>
                <button id="btn-export-trace" class="yaru-btn yaru-btn-sm" title="Export trace text">💾 Export</button>
              </div>
            </div>
            <textarea id="trace-editor-text" class="yaru-textarea" placeholder="# Enter memory addresses (one per line):
0x1A40 R
0x1A44 W
0x1A48 R
0x3F20 R
0x3F24 W" spellcheck="false"></textarea>
            <button id="btn-apply-custom-trace" class="yaru-btn yaru-btn-primary btn-block">
              ⚡ Load Custom Script into Simulator
            </button>
          </div>
        </div>

      </div>
    `;
  }

  attachEvents() {
    // Preset load buttons
    this.container.querySelectorAll('.preset-card').forEach(card => {
      const presetType = card.dataset.preset;
      const btn = card.querySelector('.btn-load-preset');
      btn.addEventListener('click', () => {
        sound.playStep();
        this.loadPreset(presetType);
      });
    });

    // Run trace button
    const runBtn = this.container.querySelector('#btn-run-loaded-trace');
    runBtn.addEventListener('click', () => {
      if (this.simulator.trace.length === 0) {
        this.loadPreset('loop');
      }
      this.simulator.startAutoRun(1.5);
    });

    // Custom script button
    const applyBtn = this.container.querySelector('#btn-apply-custom-trace');
    const editor = this.container.querySelector('#trace-editor-text');
    applyBtn.addEventListener('click', () => {
      const text = editor.value;
      const parsed = this.simulator.workloads.parseCustomTrace(text);
      if (parsed.length > 0) {
        sound.playStep();
        this.simulator.loadTrace(parsed);
      } else {
        alert('Please enter valid hex or decimal addresses (e.g. 0x1A40 R)');
      }
    });

    // Import / Export
    const fileInput = this.container.querySelector('#trace-file-input');
    const importBtn = this.container.querySelector('#btn-import-trace');
    const exportBtn = this.container.querySelector('#btn-export-trace');

    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          editor.value = ev.target.result;
          applyBtn.click();
        };
        reader.readAsText(file);
      }
    });

    exportBtn.addEventListener('click', () => {
      const blob = new Blob([editor.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'memory_trace.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  loadPreset(type) {
    let trace = [];
    switch (type) {
      case 'seq':
        trace = this.simulator.workloads.generateSequential(40);
        break;
      case 'matrix':
        trace = this.simulator.workloads.generateMatrixStride(6, 6);
        break;
      case 'thrash':
        trace = this.simulator.workloads.generateThrashing(18, 40);
        break;
      case 'multiproc':
        trace = this.simulator.workloads.generateMultiProcess(30);
        break;
      case 'rand':
        trace = this.simulator.workloads.generateRandom(40);
        break;
      case 'loop':
      default:
        trace = this.simulator.workloads.generateLoopLocality(12);
        break;
    }

    this.simulator.loadTrace(trace);

    // Populate editor with trace text
    const editor = this.container.querySelector('#trace-editor-text');
    editor.value = trace.map(t => `0x${t.address.toString(16).toUpperCase()} ${t.operation} ${t.pid}`).join('\n');
  }

  updateTraceList() {
    const trace = this.simulator.trace;
    const currentIdx = this.simulator.traceIndex;

    this.container.querySelector('#trace-progress-count').textContent = `${currentIdx} / ${trace.length}`;

    const tbody = this.container.querySelector('#trace-table-body');
    if (!trace || trace.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding: 20px;">No trace loaded. Click a preset above.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    // Show window of trace items around currentIdx
    const start = Math.max(0, currentIdx - 3);
    const end = Math.min(trace.length, currentIdx + 15);

    for (let i = start; i < end; i++) {
      const item = trace[i];
      const dec = this.simulator.decoder.decompose(item.address);
      const isPast = i < currentIdx;
      const isCurrent = i === currentIdx;

      let statusBadge = '<span class="status-indicator status-pending">Queued</span>';
      if (isPast) statusBadge = '<span class="status-indicator status-valid">Done</span>';
      else if (isCurrent) statusBadge = '<span class="status-indicator status-current">👉 Current</span>';

      const tr = document.createElement('tr');
      tr.className = isCurrent ? 'row-trace-current' : (isPast ? 'row-trace-done' : '');
      tr.innerHTML = `
        <td class="mono-bold">${i + 1}</td>
        <td class="mono-bold text-accent">0x${item.address.toString(16).toUpperCase().padStart(4, '0')}</td>
        <td class="mono-bold">${dec.vpnHex}</td>
        <td><span class="badge ${item.operation === 'W' ? 'badge-write' : 'badge-read'}">${item.operation || 'R'}</span></td>
        <td>PID ${item.pid || 1}</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  onTraceCompleted() {
    sound.playCelebration();
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#E95420', '#77216F', '#38B44A', '#5E2750']
      });
    } catch (e) {}
  }
}

/**
 * Physical Memory (RAM) & Swap Disk Visualizer
 * Interactive frame grid, live allocation telemetry, dirty page writeback tracking,
 * and page replacement policy manager (LRU, FIFO, Clock, Belady Optimal, Random).
 */

export class MemoryView {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;

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
            <span class="label">RAM Allocated:</span>
            <strong class="val text-accent" id="mem-stat-alloc">0 / 0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Page Ins:</span>
            <strong class="val text-success" id="mem-stat-pageins">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Page Outs (Dirty):</span>
            <strong class="val text-warning" id="mem-stat-pageouts">0</strong>
          </div>
          <div class="stat-chip">
            <span class="label">Evictions:</span>
            <strong class="val text-danger" id="mem-stat-evictions">0</strong>
          </div>
        </div>

        <div class="view-actions">
          <label>Page Replacement:</label>
          <select id="sel-mem-policy" class="yaru-select yaru-select-sm">
            <option value="LRU" selected>LRU</option>
            <option value="FIFO">FIFO</option>
            <option value="Clock">Clock (Second Chance)</option>
            <option value="Optimal">Optimal (Belady's MIN)</option>
            <option value="Random">Random</option>
          </select>
        </div>
      </div>

      <!-- Memory Capacity Progress Bar -->
      <div class="memory-progress-wrapper">
        <div class="progress-info">
          <span id="mem-util-text">Physical RAM Utilization: 0%</span>
          <span id="mem-capacity-text">0 KB / 16 KB</span>
        </div>
        <div class="yaru-progress-track">
          <div class="yaru-progress-fill" id="mem-progress-fill" style="width: 0%"></div>
        </div>
      </div>

      <!-- Physical Frames Grid -->
      <div class="section-title">
        <span>Physical RAM Frames</span>
        <span class="badge badge-neutral" id="mem-frames-count">16 Frames</span>
      </div>
      <div class="frames-grid" id="physical-frames-grid">
        <!-- Rendered frame cards -->
      </div>

      <!-- Swap Storage Grid -->
      <div class="section-title" style="margin-top: 18px;">
        <span>Secondary Storage (Swap Disk Blocks)</span>
        <span class="badge badge-swap" id="swap-blocks-count">64 Blocks</span>
      </div>
      <div class="swap-blocks-grid" id="swap-blocks-grid">
        <!-- Rendered swap block tiles -->
      </div>
    `;
  }

  attachEvents() {
    const policySel = this.container.querySelector('#sel-mem-policy');
    policySel.addEventListener('change', () => {
      this.simulator.updateConfiguration({ memPolicy: policySel.value });
    });
  }

  updateView(stepResult = null) {
    const mem = this.simulator.memory;
    const frames = mem.getFrames();
    const swap = mem.getSwapBlocks();
    const util = mem.getUtilization();

    // Stats
    this.container.querySelector('#mem-stat-alloc').textContent = `${util.usedFrames} / ${util.totalFrames} (${util.percentage.toFixed(0)}%)`;
    this.container.querySelector('#mem-stat-pageins').textContent = mem.stats.pageIns;
    this.container.querySelector('#mem-stat-pageouts').textContent = mem.stats.pageOuts;
    this.container.querySelector('#mem-stat-evictions').textContent = mem.stats.evictions;
    this.container.querySelector('#sel-mem-policy').value = this.simulator.config.memPolicy;

    // Progress Bar
    this.container.querySelector('#mem-util-text').textContent = `Physical RAM Utilization: ${util.percentage.toFixed(1)}%`;
    this.container.querySelector('#mem-capacity-text').textContent = `${(util.usedBytes / 1024).toFixed(1)} KB / ${(util.totalBytes / 1024).toFixed(0)} KB`;
    this.container.querySelector('#mem-progress-fill').style.width = `${util.percentage}%`;

    // Render Frames Grid
    const framesGrid = this.container.querySelector('#physical-frames-grid');
    framesGrid.innerHTML = '';

    frames.forEach(frame => {
      const isCurrentTarget = stepResult && stepResult.frame === frame.frameId;
      const isClockHand = this.simulator.config.memPolicy === 'Clock' && (frame.frameId === (mem.clockHand % mem.numFrames));

      const card = document.createElement('div');
      card.className = `frame-card ${frame.occupied ? 'frame-occupied' : 'frame-free'} ${isCurrentTarget ? 'frame-active-access' : ''} ${isClockHand ? 'frame-clock-hand' : ''}`;

      let metricInfo = 'Empty';
      if (frame.occupied) {
        if (this.simulator.config.memPolicy === 'LRU') {
          metricInfo = `Idle: ${mem.timeCounter - frame.lastAccessTime} ticks`;
        } else if (this.simulator.config.memPolicy === 'FIFO') {
          metricInfo = `Loaded: #${frame.loadTime}`;
        } else if (this.simulator.config.memPolicy === 'Clock') {
          metricInfo = frame.referenced ? 'Ref=1 (Safe)' : 'Ref=0 (Candidate)';
        } else if (this.simulator.config.memPolicy === 'Optimal') {
          metricInfo = `Accesses: ${frame.accessCount}`;
        }
      }

      card.innerHTML = `
        <div class="frame-card-header">
          <span class="frame-num">Frame #${frame.frameId}</span>
          ${isClockHand ? '<span class="badge-clock-hand" title="Clock replacement hand pointer">⏰ HAND</span>' : ''}
          <span class="frame-badge ${frame.occupied ? 'badge-in-use' : 'badge-free'}">
            ${frame.occupied ? 'RESIDENT' : 'FREE'}
          </span>
        </div>
        <div class="frame-card-body">
          <div class="frame-vpn">
            ${frame.occupied ? `Page <strong>0x${frame.vpn.toString(16).toUpperCase()}</strong>` : '<span class="text-muted">Unmapped</span>'}
          </div>
          <div class="frame-flags">
            <span class="bit-badge ${frame.dirty ? 'bit-dirty' : 'bit-clean'}">
              ${frame.dirty ? 'Dirty (Modified)' : 'Clean'}
            </span>
            <span class="bit-badge ${frame.referenced ? 'bit-ref' : 'bit-noref'}">
              Ref: ${frame.referenced ? '1' : '0'}
            </span>
          </div>
          <div class="frame-metric">${metricInfo}</div>
        </div>
      `;

      framesGrid.appendChild(card);
    });

    // Render Swap Blocks
    const swapGrid = this.container.querySelector('#swap-blocks-grid');
    swapGrid.innerHTML = '';

    swap.slice(0, 32).forEach(b => {
      const tile = document.createElement('div');
      tile.className = `swap-tile ${b.occupied ? 'swap-occupied' : 'swap-free'}`;
      tile.title = b.occupied ? `Swap Block #${b.blockId}: Holds Page 0x${b.vpn.toString(16).toUpperCase()}` : `Swap Block #${b.blockId}: Free`;
      tile.innerHTML = `
        <span class="swap-id">${b.blockId}</span>
        <span class="swap-vpn">${b.occupied ? '0x' + b.vpn.toString(16).toUpperCase() : '--'}</span>
      `;
      swapGrid.appendChild(tile);
    });
  }
}

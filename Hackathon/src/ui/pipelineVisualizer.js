/**
 * Interactive Hardware Pipeline Visualizer
 * Animated Canvas & SVG diagram rendering the full virtual memory translation journey:
 * CPU -> TLB -> Page Table Walk -> Page Fault ISR -> RAM Access -> Data Bus
 */

import { sound } from './audio.js';

export class PipelineVisualizer {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;
    this.activeStep = null;
    this.animationPhase = 0;

    this.renderLayout();
    this.attachEvents();

    this.simulator.subscribe((event, data) => {
      if (event === 'step') {
        this.onStepComplete(data);
      } else if (event === 'reset') {
        this.resetView();
      } else if (event === 'autoRunState') {
        this.updatePlayBtn(data.running);
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="pipeline-toolbar">
        <div class="input-group">
          <label for="pipeline-addr-input">Virtual Address:</label>
          <div class="input-with-badge">
            <span class="prefix">0x</span>
            <input type="text" id="pipeline-addr-input" value="1A40" placeholder="e.g. 1A40" maxlength="8" spellcheck="false" />
          </div>
        </div>

        <div class="input-group">
          <label>Op:</label>
          <select id="pipeline-op-select" class="yaru-select">
            <option value="R">Read</option>
            <option value="W">Write</option>
          </select>
        </div>

        <button id="btn-pipeline-translate" class="yaru-btn yaru-btn-primary" title="Execute single address translation">
          <span class="btn-icon">⚡</span> Translate
        </button>

        <div class="toolbar-divider"></div>

        <div class="playback-controls">
          <button id="btn-pipeline-step" class="yaru-btn" title="Step next trace item">
            <span class="btn-icon">⏭</span> Step
          </button>
          <button id="btn-pipeline-play" class="yaru-btn yaru-btn-play" title="Auto-run trace">
            <span class="btn-icon">▶</span> Run
          </button>
          <select id="pipeline-speed-select" class="yaru-select" title="Simulation Speed">
            <option value="0.5">0.5x</option>
            <option value="1" selected>1.0x</option>
            <option value="2">2.0x</option>
            <option value="4">4.0x</option>
          </select>
          <button id="btn-pipeline-reset" class="yaru-btn yaru-btn-danger" title="Reset simulator state">
            <span class="btn-icon">↺</span> Reset
          </button>
        </div>
      </div>

      <!-- Live Pipeline Hardware Canvas -->
      <div class="pipeline-canvas-container">
        <div class="hardware-flow-grid">
          
          <!-- Node 1: CPU -->
          <div class="hw-node hw-cpu" id="node-cpu">
            <div class="hw-node-header">
              <span class="node-icon">💻</span>
              <span class="node-title">CPU Core</span>
            </div>
            <div class="hw-node-body">
              <div class="field-label">Current Logical Address:</div>
              <div class="badge-address-split">
                <span class="badge badge-vpn" id="disp-vpn" title="Virtual Page Number">VPN: --</span>
                <span class="badge badge-offset" id="disp-offset" title="Offset inside page">Offset: --</span>
              </div>
              <div class="address-hex-disp" id="disp-full-hex">0x0000</div>
              <div class="address-bin-disp" id="disp-full-bin">0000 0000 0000 0000</div>
            </div>
          </div>

          <!-- Bus arrow 1 -->
          <div class="bus-arrow-horizontal" id="bus-cpu-tlb">
            <div class="signal-packet"></div>
            <span class="bus-label">VPN Bus</span>
          </div>

          <!-- Node 2: TLB -->
          <div class="hw-node hw-tlb" id="node-tlb">
            <div class="hw-node-header">
              <span class="node-icon">⚡</span>
              <span class="node-title">TLB Cache (CAM)</span>
              <span class="hw-badge" id="badge-tlb-status">READY</span>
            </div>
            <div class="hw-node-body">
              <div class="tlb-lookup-info">
                <div>Tag Query: <strong id="tlb-query-tag">--</strong></div>
                <div>Associativity: <strong id="tlb-assoc-mode">Fully Assoc</strong></div>
              </div>
              <div class="tlb-result-banner" id="tlb-result-banner">Waiting for request...</div>
            </div>
          </div>

          <!-- Branch arrows from TLB -->
          <div class="tlb-branch-container">
            <div class="branch-hit" id="bus-tlb-hit">
              <span class="badge badge-hit">TLB HIT (Fast Path)</span>
              <div class="signal-packet packet-hit"></div>
            </div>
            <div class="branch-miss" id="bus-tlb-miss">
              <span class="badge badge-miss">TLB MISS (Fallback)</span>
              <div class="signal-packet packet-miss"></div>
            </div>
          </div>

          <!-- Node 3: Page Table -->
          <div class="hw-node hw-pagetable" id="node-pt">
            <div class="hw-node-header">
              <span class="node-icon">📑</span>
              <span class="node-title">Page Table Walk</span>
              <span class="hw-badge" id="badge-pt-status">READY</span>
            </div>
            <div class="hw-node-body">
              <div class="pt-walk-info">
                <div>Index: <strong id="pt-query-index">--</strong></div>
                <div>Mode: <strong id="pt-mode-name">Single Level</strong></div>
              </div>
              <div class="pt-result-banner" id="pt-result-banner">Idle</div>
            </div>
          </div>

          <!-- Node 4: Secondary Swap Disk (for Page Faults) -->
          <div class="hw-node hw-swap" id="node-swap">
            <div class="hw-node-header">
              <span class="node-icon">💾</span>
              <span class="node-title">Swap Storage (Disk)</span>
            </div>
            <div class="hw-node-body">
              <div class="swap-status-icon" id="swap-disk-spinner">💿</div>
              <div class="swap-status-text" id="swap-status-text">Swap Idle</div>
            </div>
          </div>

          <!-- Node 5: Physical RAM -->
          <div class="hw-node hw-ram" id="node-ram">
            <div class="hw-node-header">
              <span class="node-icon">🧠</span>
              <span class="node-title">Physical RAM</span>
              <span class="hw-badge" id="badge-ram-status">READY</span>
            </div>
            <div class="hw-node-body">
              <div class="phys-addr-box">
                <div class="field-label">Target Physical Address:</div>
                <div class="badge-address-split">
                  <span class="badge badge-frame" id="disp-frame">Frame: --</span>
                  <span class="badge badge-offset" id="disp-ram-offset">Offset: --</span>
                </div>
                <div class="address-hex-disp phys-hex" id="disp-phys-hex">0x0000</div>
              </div>
              <div class="ram-access-status" id="ram-access-status">Ready to access</div>
            </div>
          </div>

        </div>
      </div>

      <!-- Step-by-Step Translation Walkthrough Timeline -->
      <div class="pipeline-timeline-container">
        <div class="timeline-header">
          <span class="title">⏱ Translation Event Trace & Signals</span>
          <span class="latency-badge" id="step-latency-badge">Latency: 0 ns</span>
        </div>
        <div class="timeline-steps" id="pipeline-timeline-steps">
          <div class="empty-state">No address translated yet. Enter an address above or click "Step" to run the trace.</div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    const translateBtn = this.container.querySelector('#btn-pipeline-translate');
    const addrInput = this.container.querySelector('#pipeline-addr-input');
    const opSelect = this.container.querySelector('#pipeline-op-select');
    const stepBtn = this.container.querySelector('#btn-pipeline-step');
    const playBtn = this.container.querySelector('#btn-pipeline-play');
    const speedSelect = this.container.querySelector('#pipeline-speed-select');
    const resetBtn = this.container.querySelector('#btn-pipeline-reset');

    translateBtn.addEventListener('click', () => {
      const val = addrInput.value.trim();
      const op = opSelect.value;
      sound.playStep();
      this.simulator.translate(val, op, 1);
    });

    addrInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        translateBtn.click();
      }
    });

    stepBtn.addEventListener('click', () => {
      sound.playStep();
      const res = this.simulator.stepNext();
      if (!res && this.simulator.trace.length === 0) {
        // Load default sequential workload if empty
        const defaultTrace = this.simulator.workloads.generateSequential(30);
        this.simulator.loadTrace(defaultTrace);
        this.simulator.stepNext();
      }
    });

    playBtn.addEventListener('click', () => {
      if (this.simulator.trace.length === 0) {
        const defaultTrace = this.simulator.workloads.generateLoopLocality(10);
        this.simulator.loadTrace(defaultTrace);
      }
      this.simulator.toggleAutoRun();
    });

    speedSelect.addEventListener('change', () => {
      this.simulator.setSpeed(parseFloat(speedSelect.value));
    });

    resetBtn.addEventListener('click', () => {
      sound.playStep();
      this.simulator.reset();
    });
  }

  updatePlayBtn(isRunning) {
    const playBtn = this.container.querySelector('#btn-pipeline-play');
    if (!playBtn) return;
    if (isRunning) {
      playBtn.innerHTML = '<span class="btn-icon">⏸</span> Pause';
      playBtn.classList.add('running');
    } else {
      playBtn.innerHTML = '<span class="btn-icon">▶</span> Run';
      playBtn.classList.remove('running');
    }
  }

  onStepComplete(result) {
    const dec = result.logicalAddress;
    const phys = result.physicalAddress;

    // Update CPU Display
    this.container.querySelector('#disp-vpn').textContent = `VPN: ${dec.vpnHex}`;
    this.container.querySelector('#disp-offset').textContent = `Offset: ${dec.offsetHex}`;
    this.container.querySelector('#disp-full-hex').textContent = `${dec.hex} (${result.operation})`;
    this.container.querySelector('#disp-full-bin').textContent = this.formatBinarySpaced(dec.binary);

    // Update TLB Node
    const tlbNode = this.container.querySelector('#node-tlb');
    const tlbBadge = this.container.querySelector('#badge-tlb-status');
    const tlbBanner = this.container.querySelector('#tlb-result-banner');
    this.container.querySelector('#tlb-query-tag').textContent = dec.vpnHex;
    this.container.querySelector('#tlb-assoc-mode').textContent = this.simulator.config.tlbAssociativity;

    // Clear prior animation states
    tlbNode.classList.remove('state-hit', 'state-miss');
    const ptNode = this.container.querySelector('#node-pt');
    ptNode.classList.remove('state-hit', 'state-fault');
    const ramNode = this.container.querySelector('#node-ram');
    ramNode.classList.remove('state-access');
    const swapNode = this.container.querySelector('#node-swap');
    swapNode.classList.remove('state-active');

    if (result.tlbHit) {
      sound.playHit();
      tlbNode.classList.add('state-hit');
      tlbBadge.textContent = 'HIT';
      tlbBadge.className = 'hw-badge badge-success';
      tlbBanner.innerHTML = `<strong>TLB HIT!</strong> Direct match in cache.<br>Retrieved Frame <strong>#${result.frame}</strong> (${this.simulator.config.tlbLatency} ns)`;
      
      this.container.querySelector('#bus-tlb-hit').classList.add('active');
      this.container.querySelector('#bus-tlb-miss').classList.remove('active');
    } else {
      tlbNode.classList.add('state-miss');
      tlbBadge.textContent = 'MISS';
      tlbBadge.className = 'hw-badge badge-warning';
      tlbBanner.innerHTML = `<strong>TLB MISS!</strong> VPN not cached.<br>Triggering Page Table walk...`;

      this.container.querySelector('#bus-tlb-hit').classList.remove('active');
      this.container.querySelector('#bus-tlb-miss').classList.add('active');
    }

    // Update Page Table Node
    const ptBadge = this.container.querySelector('#badge-pt-status');
    const ptBanner = this.container.querySelector('#pt-result-banner');
    this.container.querySelector('#pt-query-index').textContent = `VPN ${dec.vpnHex} (${dec.vpn})`;
    this.container.querySelector('#pt-mode-name').textContent = this.simulator.config.pagingType.toUpperCase();

    if (!result.tlbHit) {
      if (!result.pageFault) {
        sound.playHit();
        ptNode.classList.add('state-hit');
        ptBadge.textContent = 'PAGE HIT';
        ptBadge.className = 'hw-badge badge-success';
        ptBanner.innerHTML = `<strong>PAGE HIT</strong> (Present=1)<br>Frame #${result.frame} resolved. TLB updated.`;
      } else {
        sound.playPageFault();
        ptNode.classList.add('state-fault');
        ptBadge.textContent = 'PAGE FAULT';
        ptBadge.className = 'hw-badge badge-danger';
        ptBanner.innerHTML = `<strong>PAGE FAULT!</strong> (Present=0)<br>Trap to OS Kernel! Disk swap required.`;

        // Swap node animation
        swapNode.classList.add('state-active');
        const swapText = this.container.querySelector('#swap-status-text');
        if (result.dirtyWriteback) {
          swapText.innerHTML = `<strong>Dirty Page Out</strong> (Victim Frame #${result.frame}) + <strong>Page In</strong> (${dec.vpnHex})`;
        } else {
          swapText.innerHTML = `<strong>Page In</strong> (Reading ${dec.vpnHex} into Frame #${result.frame})`;
        }
      }
    } else {
      ptBadge.textContent = 'BYPASSED';
      ptBadge.className = 'hw-badge badge-neutral';
      ptBanner.innerHTML = `Bypassed by TLB Hit. Zero memory overhead!`;
    }

    // Update RAM Node
    ramNode.classList.add('state-access');
    this.container.querySelector('#disp-frame').textContent = `Frame: #${result.frame}`;
    this.container.querySelector('#disp-ram-offset').textContent = `Offset: ${dec.offsetHex}`;
    this.container.querySelector('#disp-phys-hex').textContent = phys.hex;
    this.container.querySelector('#ram-access-status').innerHTML = `
      Accessed Physical Memory at <strong>${phys.hex}</strong> (${result.operation === 'W' ? 'Written / Dirty' : 'Read'}).
    `;

    // Latency badge
    this.container.querySelector('#step-latency-badge').textContent = `Step Latency: ${this.simulator.formatLatency(result.totalLatency)}`;

    // Render Timeline Steps
    this.renderTimeline(result.timeline);
  }

  renderTimeline(timeline) {
    const stepsContainer = this.container.querySelector('#pipeline-timeline-steps');
    stepsContainer.innerHTML = '';

    timeline.forEach(step => {
      const el = document.createElement('div');
      el.className = `timeline-step-row step-type-${step.type}`;
      el.innerHTML = `
        <div class="step-num">${step.step}</div>
        <div class="step-content">
          <div class="step-title">${step.title}</div>
          <div class="step-detail">${step.detail}</div>
        </div>
      `;
      stepsContainer.appendChild(el);
    });

    // Auto-scroll to bottom of timeline
    stepsContainer.scrollTop = stepsContainer.scrollHeight;
  }

  resetView() {
    this.container.querySelector('#disp-vpn').textContent = 'VPN: --';
    this.container.querySelector('#disp-offset').textContent = 'Offset: --';
    this.container.querySelector('#disp-full-hex').textContent = '0x0000';
    this.container.querySelector('#disp-full-bin').textContent = '0000 0000 0000 0000';

    this.container.querySelector('#badge-tlb-status').textContent = 'READY';
    this.container.querySelector('#badge-tlb-status').className = 'hw-badge';
    this.container.querySelector('#tlb-result-banner').textContent = 'Waiting for request...';

    this.container.querySelector('#badge-pt-status').textContent = 'READY';
    this.container.querySelector('#badge-pt-status').className = 'hw-badge';
    this.container.querySelector('#pt-result-banner').textContent = 'Idle';

    this.container.querySelector('#disp-frame').textContent = 'Frame: --';
    this.container.querySelector('#disp-ram-offset').textContent = 'Offset: --';
    this.container.querySelector('#disp-phys-hex').textContent = '0x0000';
    this.container.querySelector('#ram-access-status').textContent = 'Ready to access';

    this.container.querySelector('#step-latency-badge').textContent = 'Latency: 0 ns';
    this.container.querySelector('#pipeline-timeline-steps').innerHTML = `
      <div class="empty-state">Simulator reset. Enter an address above or step through a trace.</div>
    `;

    this.container.querySelectorAll('.hw-node').forEach(n => {
      n.classList.remove('state-hit', 'state-miss', 'state-fault', 'state-access', 'state-active');
    });
    this.container.querySelectorAll('.branch-hit, .branch-miss').forEach(b => b.classList.remove('active'));
  }

  formatBinarySpaced(binStr) {
    if (!binStr) return '';
    const chunks = [];
    for (let i = 0; i < binStr.length; i += 4) {
      chunks.push(binStr.slice(i, i + 4));
    }
    return chunks.join(' ');
  }
}

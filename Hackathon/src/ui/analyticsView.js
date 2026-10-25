/**
 * Performance & Effective Access Time (EAT) Analytics View
 * Real-time Chart.js telemetry charts, hit ratio timelines,
 * and an interactive EAT What-If sensitivity calculator.
 */

import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export class AnalyticsView {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;
    this.hitRateHistory = [];
    this.stepLabels = [];

    this.renderLayout();
    this.initCharts();
    this.attachEvents();
    this.updateCharts();

    this.simulator.subscribe((event, data) => {
      if (event === 'step') {
        this.recordHistory(data);
        this.updateCharts();
      } else if (event === 'reset') {
        this.hitRateHistory = [];
        this.stepLabels = [];
        this.updateCharts();
      }
    });
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="analytics-grid">
        <!-- Top Telemetry KPI Cards -->
        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">TLB Hit Ratio</div>
            <div class="kpi-val text-success" id="kpi-hit-rate">0.0%</div>
            <div class="kpi-sub" id="kpi-hit-count">0 hits / 0 total</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Empirical EAT</div>
            <div class="kpi-val text-accent" id="kpi-empirical-eat">0.0 ns</div>
            <div class="kpi-sub">Average memory access time</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Theoretical EAT</div>
            <div class="kpi-val text-yellow" id="kpi-theoretical-eat">0.0 ns</div>
            <div class="kpi-sub">Formula-based target</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Page Faults</div>
            <div class="kpi-val text-danger" id="kpi-fault-rate">0 (0.0%)</div>
            <div class="kpi-sub" id="kpi-dirty-evict">0 dirty writebacks</div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <!-- Chart 1: Hit Ratio Timeline -->
          <div class="chart-box">
            <div class="chart-header">
              <span>TLB Hit Ratio Over Time (%)</span>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="chart-hit-timeline"></canvas>
            </div>
          </div>

          <!-- Chart 2: TLB Hit vs Miss Donut -->
          <div class="chart-box">
            <div class="chart-header">
              <span>Cache Hits vs Misses</span>
            </div>
            <div class="chart-canvas-wrapper chart-donut-wrapper">
              <canvas id="chart-donut"></canvas>
            </div>
          </div>
        </div>

        <!-- Interactive EAT Mathematical Sensitivity Explorer -->
        <div class="eat-explorer-card">
          <div class="section-title">
            <span>🔬 Interactive Effective Access Time (EAT) Sensitivity Explorer</span>
            <span class="badge badge-neutral">What-If Modeler</span>
          </div>
          <p class="section-desc">
            Explore how TLB hit ratio and Page Fault probability mathematically govern CPU memory latency.
          </p>

          <div class="eat-sliders-grid">
            <div class="slider-group">
              <div class="slider-header">
                <label>TLB Hit Ratio (α):</label>
                <span class="slider-val" id="val-slider-alpha">95%</span>
              </div>
              <input type="range" id="slider-alpha" min="50" max="100" value="95" step="1" class="yaru-slider" />
            </div>

            <div class="slider-group">
              <div class="slider-header">
                <label>TLB Access Latency (t_TLB):</label>
                <span class="slider-val" id="val-slider-ttlb">1 ns</span>
              </div>
              <input type="range" id="slider-ttlb" min="0.5" max="10" value="1" step="0.5" class="yaru-slider" />
            </div>

            <div class="slider-group">
              <div class="slider-header">
                <label>RAM Latency (t_RAM):</label>
                <span class="slider-val" id="val-slider-tram">100 ns</span>
              </div>
              <input type="range" id="slider-tram" min="20" max="250" value="100" step="5" class="yaru-slider" />
            </div>

            <div class="slider-group">
              <div class="slider-header">
                <label>Page Fault Probability (p):</label>
                <span class="slider-val" id="val-slider-p">0.02%</span>
              </div>
              <input type="range" id="slider-p" min="0" max="2" value="0.02" step="0.01" class="yaru-slider" />
            </div>

            <div class="slider-group">
              <div class="slider-header">
                <label>Page Table Levels (k):</label>
                <span class="slider-val" id="val-slider-k">1 Level</span>
              </div>
              <input type="range" id="slider-k" min="1" max="4" value="1" step="1" class="yaru-slider" />
            </div>

            <div class="slider-group">
              <div class="slider-header">
                <label>Disk Fault Penalty (t_Disk):</label>
                <span class="slider-val" id="val-slider-tdisk">8 ms</span>
              </div>
              <input type="range" id="slider-tdisk" min="1" max="20" value="8" step="1" class="yaru-slider" />
            </div>
          </div>

          <!-- Formula & Calculation Output Display -->
          <div class="eat-calc-output">
            <div class="formula-box">
              <code>EAT = α·(t_TLB + t_RAM) + (1-α)·[t_TLB + (1-p)·(k·t_RAM + t_RAM) + p·t_Disk]</code>
            </div>
            <div class="eat-result-banner">
              Computed EAT: <strong class="text-accent" id="calc-eat-val">106.8 ns</strong>
              <span class="eat-overhead-pill" id="calc-eat-overhead">1.07x slower than pure RAM</span>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  initCharts() {
    // 1. Timeline Chart
    const ctxTimeline = this.container.querySelector('#chart-hit-timeline').getContext('2d');
    this.timelineChart = new Chart(ctxTimeline, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'TLB Hit Ratio (%)',
          data: [],
          borderColor: '#E95420', // Ubuntu Orange
          backgroundColor: 'rgba(233, 84, 32, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#AEA79F' },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#AEA79F', maxTicksLimit: 8 },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });

    // 2. Donut Chart
    const ctxDonut = this.container.querySelector('#chart-donut').getContext('2d');
    this.donutChart = new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels: ['Hits', 'Misses'],
        datasets: [{
          data: [0, 0],
          backgroundColor: ['#38B44A', '#E95420'], // Green & Orange
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#FFFFFF', font: { family: 'Ubuntu', size: 12 } },
          },
        },
        cutout: '70%',
      },
    });
  }

  attachEvents() {
    const sAlpha = this.container.querySelector('#slider-alpha');
    const sTtlb = this.container.querySelector('#slider-ttlb');
    const sTram = this.container.querySelector('#slider-tram');
    const sP = this.container.querySelector('#slider-p');
    const sK = this.container.querySelector('#slider-k');
    const sTdisk = this.container.querySelector('#slider-tdisk');

    const onSliderChange = () => {
      this.updateWhatIfCalculator();
    };

    [sAlpha, sTtlb, sTram, sP, sK, sTdisk].forEach(slider => {
      slider.addEventListener('input', onSliderChange);
    });

    this.updateWhatIfCalculator();
  }

  recordHistory(result) {
    const total = this.simulator.stats.totalAccesses;
    const hitRate = (this.simulator.stats.tlbHits / total) * 100;
    this.hitRateHistory.push(parseFloat(hitRate.toFixed(1)));
    this.stepLabels.push(`#${total}`);

    // Limit points to 50 for smooth rendering
    if (this.hitRateHistory.length > 50) {
      this.hitRateHistory.shift();
      this.stepLabels.shift();
    }
  }

  updateCharts() {
    const stats = this.simulator.stats;
    const total = stats.totalAccesses;
    const hitRate = total > 0 ? (stats.tlbHits / total) * 100 : 0;
    const faultRate = total > 0 ? (stats.pageFaults / total) * 100 : 0;
    const eat = this.simulator.calculateEAT();

    // KPIs
    this.container.querySelector('#kpi-hit-rate').textContent = `${hitRate.toFixed(1)}%`;
    this.container.querySelector('#kpi-hit-count').textContent = `${stats.tlbHits} hits / ${total} total`;
    this.container.querySelector('#kpi-empirical-eat').textContent = eat.empiricalFormatted;
    this.container.querySelector('#kpi-theoretical-eat').textContent = eat.theoreticalFormatted;
    this.container.querySelector('#kpi-fault-rate').textContent = `${stats.pageFaults} (${faultRate.toFixed(2)}%)`;
    this.container.querySelector('#kpi-dirty-evict').textContent = `${stats.dirtyEvictions} dirty writebacks`;

    // Timeline Chart
    this.timelineChart.data.labels = [...this.stepLabels];
    this.timelineChart.data.datasets[0].data = [...this.hitRateHistory];
    this.timelineChart.update('none');

    // Donut Chart
    this.donutChart.data.datasets[0].data = [stats.tlbHits, stats.tlbMisses];
    this.donutChart.update('none');
  }

  updateWhatIfCalculator() {
    const alpha = parseFloat(this.container.querySelector('#slider-alpha').value) / 100;
    const ttlb = parseFloat(this.container.querySelector('#slider-ttlb').value);
    const tram = parseFloat(this.container.querySelector('#slider-tram').value);
    const p = parseFloat(this.container.querySelector('#slider-p').value) / 100;
    const k = parseInt(this.container.querySelector('#slider-k').value, 10);
    const tdiskMs = parseFloat(this.container.querySelector('#slider-tdisk').value);
    const tdiskNs = tdiskMs * 1000000;

    // Update labels
    this.container.querySelector('#val-slider-alpha').textContent = `${(alpha * 100).toFixed(0)}%`;
    this.container.querySelector('#val-slider-ttlb').textContent = `${ttlb} ns`;
    this.container.querySelector('#val-slider-tram').textContent = `${tram} ns`;
    this.container.querySelector('#val-slider-p').textContent = `${(p * 100).toFixed(2)}%`;
    this.container.querySelector('#val-slider-k').textContent = `${k} Level${k > 1 ? 's' : ''}`;
    this.container.querySelector('#val-slider-tdisk').textContent = `${tdiskMs} ms`;

    // Mathematical formula
    // EAT = alpha * (ttlb + tram) + (1 - alpha) * (ttlb + (1 - p)*(k*tram + tram) + p * (tdiskNs + tram))
    const hitTime = alpha * (ttlb + tram);
    const missTime = (1 - alpha) * (
      ttlb +
      (1 - p) * (k * tram + tram) +
      p * (tdiskNs + tram)
    );
    const calculatedEat = hitTime + missTime;

    let eatFormatted = '';
    if (calculatedEat >= 1000000) {
      eatFormatted = (calculatedEat / 1000000).toFixed(2) + ' ms';
    } else if (calculatedEat >= 1000) {
      eatFormatted = (calculatedEat / 1000).toFixed(2) + ' µs';
    } else {
      eatFormatted = calculatedEat.toFixed(1) + ' ns';
    }

    const overheadRatio = (calculatedEat / tram).toFixed(2);

    this.container.querySelector('#calc-eat-val').textContent = eatFormatted;
    this.container.querySelector('#calc-eat-overhead').textContent = `${overheadRatio}x memory baseline`;
  }
}

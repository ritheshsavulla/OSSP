/**
 * Ubuntu Terminal (bash) Emulator
 * Provides an authentic interactive Linux shell with rich commands for inspecting,
 * executing, and controlling the TLB & Page Table simulation engine.
 */

import { sound } from './audio.js';

export class TerminalEmulator {
  constructor(containerId, simulator) {
    this.container = document.getElementById(containerId);
    this.simulator = simulator;
    this.history = [];
    this.historyIndex = -1;

    this.renderLayout();
    this.attachEvents();
    this.printWelcome();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="terminal-body" id="term-body">
        <div class="terminal-output" id="term-output"></div>
        <div class="terminal-input-row">
          <span class="term-prompt"><span class="user">ubuntu@ossp-hackathon</span>:<span class="path">~</span>$&nbsp;</span>
          <input type="text" id="term-input" autocomplete="off" spellcheck="false" autofocus />
        </div>
      </div>
    `;
  }

  attachEvents() {
    const input = this.container.querySelector('#term-input');
    const body = this.container.querySelector('#term-body');

    body.addEventListener('click', () => {
      input.focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value.trim();
        input.value = '';
        if (cmd) {
          this.history.push(cmd);
          this.historyIndex = this.history.length;
        }
        this.printLine(`<span class="term-prompt"><span class="user">ubuntu@ossp-hackathon</span>:<span class="path">~</span>$&nbsp;</span>${this.escapeHtml(cmd)}`);
        this.executeCommand(cmd);
        body.scrollTop = body.scrollHeight;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          input.value = '';
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.handleAutocomplete(input);
      }
    });
  }

  handleAutocomplete(input) {
    const val = input.value.trim().toLowerCase();
    const commands = ['help', 'translate', 'tlb', 'ptable', 'meminfo', 'eat', 'run', 'config', 'step', 'clear', 'uname', 'whoami', 'top', 'man'];
    const matches = commands.filter(c => c.startsWith(val));
    if (matches.length === 1) {
      input.value = matches[0] + ' ';
    } else if (matches.length > 1) {
      this.printLine(`<span class="term-dim">${matches.join('   ')}</span>`);
    }
  }

  printLine(html) {
    const output = this.container.querySelector('#term-output');
    const div = document.createElement('div');
    div.className = 'term-line';
    div.innerHTML = html;
    output.appendChild(div);
  }

  printWelcome() {
    this.printLine(`
      <span class="term-bold term-orange">Welcome to Ubuntu 24.04 LTS (GNU/Linux 6.8.0-generic x86_64)</span><br>
      <span class="term-cyan">* Documentation:</span> https://github.com/ossp-hackathon/tlb-simulator<br>
      <span class="term-cyan">* Management:</span> TLB, Hierarchical Page Tables & Memory Management Subsystem<br>
      <span class="term-dim">Type <span class="term-bold term-yellow">help</span> or <span class="term-bold term-yellow">man</span> to view available simulator commands.</span><br>
    `);
  }

  executeCommand(rawCmd) {
    if (!rawCmd) return;
    const parts = rawCmd.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    sound.playStep();

    switch (cmd) {
      case 'help':
      case 'man':
        this.cmdHelp();
        break;

      case 'clear':
        this.container.querySelector('#term-output').innerHTML = '';
        break;

      case 'translate':
        this.cmdTranslate(args);
        break;

      case 'tlb':
        this.cmdTLB(args);
        break;

      case 'ptable':
      case 'pagetable':
        this.cmdPageTable(args);
        break;

      case 'meminfo':
      case 'cat':
        if (cmd === 'cat' && args[0] !== '/proc/meminfo') {
          this.printLine(`<span class="term-red">cat: ${args[0] || ''}: No such file or directory</span>`);
        } else {
          this.cmdMemInfo();
        }
        break;

      case 'eat':
        this.cmdEAT();
        break;

      case 'run':
        this.cmdRun(args);
        break;

      case 'step':
        this.cmdStep();
        break;

      case 'config':
        this.cmdConfig(args);
        break;

      case 'uname':
        this.printLine('Linux ossp-hackathon 6.8.0-generic #24-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux');
        break;

      case 'whoami':
        this.printLine('ubuntu');
        break;

      case 'top':
        this.cmdTop();
        break;

      default:
        this.printLine(`<span class="term-red">bash: command not found: ${this.escapeHtml(cmd)}</span>. Type <span class="term-yellow">help</span> for available commands.`);
        break;
    }
  }

  cmdHelp() {
    this.printLine(`
      <span class="term-bold term-green">OS Simulator Commands:</span><br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">translate &lt;addr&gt; [r|w]</span> &nbsp;Translate logical address (e.g. translate 0x1A40 W)<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">tlb</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Dump TLB cache entries and hit/miss statistics<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">tlb --flush</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Flush / Invalidate all TLB entries<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">ptable</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Inspect active Page Table entries (Present, Frame, Dirty)<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">meminfo</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Show RAM frames utilization and Swap space status<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">eat</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Print Effective Access Time (EAT) mathematical breakdown<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">run &lt;preset&gt;</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Load and run preset trace (seq | loop | matrix | thrash | rand)<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">step</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Step to next instruction in the active trace<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">config</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;View current hardware configuration parameters<br>
      &nbsp;&nbsp;<span class="term-bold term-yellow">clear</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Clear terminal screen<br>
    `);
  }

  cmdTranslate(args) {
    if (args.length === 0) {
      this.printLine('<span class="term-red">Usage: translate &lt;address_hex_or_dec&gt; [R|W]</span>');
      return;
    }
    const addr = args[0];
    const op = args[1] && args[1].toUpperCase() === 'W' ? 'W' : 'R';
    const res = this.simulator.translate(addr, op, 1);

    this.printLine(`
      <span class="term-bold term-cyan">--- Translation Complete ---</span><br>
      Logical Address: <span class="term-yellow">${res.logicalAddress.hex}</span> (Op: ${res.operation})<br>
      VPN: <span class="term-accent">${res.logicalAddress.vpnHex}</span> (Index: ${res.logicalAddress.vpn}) | Offset: <span class="term-accent">${res.logicalAddress.offsetHex}</span><br>
      TLB Lookup: ${res.tlbHit ? '<span class="term-green">HIT (Found in TLB)</span>' : '<span class="term-red">MISS (Page Table Walk)</span>'}<br>
      ${!res.tlbHit ? (res.pageFault ? '<span class="term-red">PAGE FAULT! Loaded from swap disk.</span>' : '<span class="term-green">PAGE HIT in Page Table.</span>') : ''}<br>
      Physical Address: <span class="term-green">${res.physicalAddress.hex}</span> (Frame #${res.frame} | Offset: ${res.logicalAddress.offsetHex})<br>
      Latency: <span class="term-orange">${this.simulator.formatLatency(res.totalLatency)}</span>
    `);
  }

  cmdTLB(args) {
    if (args[0] === '--flush') {
      this.simulator.tlb.flush();
      this.printLine('<span class="term-green">TLB flushed successfully. All entries invalidated.</span>');
      return;
    }

    const entries = this.simulator.tlb.getEntries();
    const stats = this.simulator.tlb.getStats();

    let out = `<span class="term-bold term-cyan">Translation Lookaside Buffer (TLB) - ${this.simulator.config.tlbPolicy} | ${this.simulator.config.tlbAssociativity}</span><br>`;
    out += `Entries: ${entries.length} | Hits: ${stats.hits} | Misses: ${stats.misses} | Hit Rate: <span class="term-green">${stats.hitRate.toFixed(1)}%</span><br><br>`;
    out += `<span class="term-dim">Idx  Set  Valid  Tag (VPN)  Frame   Dirty  Ref</span><br>`;
    out += `<span class="term-dim">---------------------------------------------</span><br>`;

    entries.forEach(e => {
      const setIdx = Math.floor(e.index / this.simulator.tlb.ways);
      const tagStr = e.valid ? '0x' + e.tag.toString(16).toUpperCase().padStart(2, '0') : ' -- ';
      const frameStr = e.valid ? ('#' + e.frame).padEnd(6, ' ') : ' --   ';
      out += `[${e.index.toString().padStart(2, '0')}]  ${setIdx}     ${e.valid ? ' 1 ' : ' 0 '}    ${tagStr.padEnd(8, ' ')} ${frameStr} ${e.dirty ? ' 1 ' : ' 0 '}    ${e.ref ? ' 1 ' : ' 0 '}<br>`;
    });

    this.printLine(out);
  }

  cmdPageTable(args) {
    const mode = this.simulator.config.pagingType;
    let out = `<span class="term-bold term-cyan">Page Table (${mode.toUpperCase()})</span><br>`;

    if (mode === 'single') {
      const table = this.simulator.pageTable.singleTable.slice(0, 16);
      out += `<span class="term-dim">VPN   VPN(Hex)  Present  Frame   Dirty  Ref  Swap</span><br>`;
      out += `<span class="term-dim">--------------------------------------------------</span><br>`;
      table.forEach(p => {
        out += `${p.vpn.toString().padEnd(4, ' ')}  0x${p.vpn.toString(16).toUpperCase().padStart(2, '0')}     ${p.present ? '<span class="term-green">1</span>' : '<span class="term-dim">0</span>'}       ${p.present ? ('#' + p.frame).padEnd(6, ' ') : '--    '}  ${p.dirty ? '1' : '0'}      ${p.referenced ? '1' : '0'}    ${p.swapBlock !== null ? '#' + p.swapBlock : 'None'}<br>`;
      });
      out += `<span class="term-dim">... showing first 16 entries of ${this.simulator.pageTable.singleTable.length}.</span>`;
    } else {
      out += `Hierarchical / Inverted mode active. View graphical inspector window for full structural tree.`;
    }

    this.printLine(out);
  }

  cmdMemInfo() {
    const util = this.simulator.memory.getUtilization();
    const stats = this.simulator.memory.stats;

    this.printLine(`
      <span class="term-bold term-cyan">Memory Subsystem Telemetry:</span><br>
      MemTotal:        ${(util.totalBytes / 1024).toFixed(0)} kB<br>
      MemFree:         ${((util.totalBytes - util.usedBytes) / 1024).toFixed(0)} kB<br>
      MemUsed:         ${(util.usedBytes / 1024).toFixed(0)} kB (${util.percentage.toFixed(1)}%)<br>
      FramesTotal:     ${util.totalFrames} frames<br>
      FramesAllocated: ${util.usedFrames} frames<br>
      PageFaults:      ${stats.pageFaults}<br>
      PageIns:         ${stats.pageIns}<br>
      PageOuts(Dirty): ${stats.pageOuts}<br>
      Replacement:     ${this.simulator.config.memPolicy}<br>
    `);
  }

  cmdEAT() {
    const eat = this.simulator.calculateEAT();
    this.printLine(`
      <span class="term-bold term-cyan">Effective Access Time (EAT) Metrics:</span><br>
      Empirical EAT:     <span class="term-green term-bold">${eat.empiricalFormatted}</span> (Recorded across ${this.simulator.stats.totalAccesses} accesses)<br>
      Theoretical EAT:   <span class="term-yellow term-bold">${eat.theoreticalFormatted}</span><br>
      Formula:           EAT = h * (t_tlb + t_ram) + (1 - h) * [t_tlb + (1 - p)*(k*t_ram + t_ram) + p*(t_fault)]<br>
      Parameters:<br>
      &nbsp;&nbsp;TLB Hit Rate (h):         ${eat.hitRate}%<br>
      &nbsp;&nbsp;Page Fault Rate (p):      ${eat.pageFaultRate}%<br>
      &nbsp;&nbsp;Page Table Levels (k):    ${eat.ptLevels}<br>
      &nbsp;&nbsp;TLB Latency:              ${this.simulator.config.tlbLatency} ns<br>
      &nbsp;&nbsp;RAM Latency:              ${this.simulator.config.ramLatency} ns<br>
      &nbsp;&nbsp;Disk Fault Latency:       ${this.simulator.formatLatency(this.simulator.config.pageFaultLatency)}<br>
    `);
  }

  cmdRun(args) {
    const preset = args[0] ? args[0].toLowerCase() : 'loop';
    let trace = [];

    if (preset === 'seq') {
      trace = this.simulator.workloads.generateSequential(30);
    } else if (preset === 'matrix') {
      trace = this.simulator.workloads.generateMatrixStride(5, 5);
    } else if (preset === 'thrash') {
      trace = this.simulator.workloads.generateThrashing(16, 30);
    } else if (preset === 'rand') {
      trace = this.simulator.workloads.generateRandom(30);
    } else {
      trace = this.simulator.workloads.generateLoopLocality(10);
    }

    this.simulator.loadTrace(trace);
    this.printLine(`<span class="term-green">Loaded preset '${preset}' (${trace.length} operations).</span> Starting run...`);
    this.simulator.startAutoRun(1.5);
  }

  cmdStep() {
    const res = this.simulator.stepNext();
    if (res) {
      this.printLine(`Step #${res.stepNumber}: ${res.logicalAddress.hex} -> Frame #${res.frame} (${res.tlbHit ? 'TLB HIT' : (res.pageFault ? 'PAGE FAULT' : 'PAGE HIT')})`);
    } else {
      this.printLine('<span class="term-dim">End of trace reached or no trace loaded. Type "run loop" to load a preset.</span>');
    }
  }

  cmdConfig(args) {
    this.printLine(`
      <span class="term-bold term-cyan">Active Hardware Architecture:</span><br>
      Virtual Address:    ${this.simulator.config.addressBits}-bit (${this.simulator.decoder.numVirtualPages} virtual pages)<br>
      Page Size:          ${this.simulator.config.pageSize} Bytes (${this.simulator.decoder.offsetBits} offset bits)<br>
      Physical RAM:       ${this.simulator.config.ramSize} Bytes (${this.simulator.memory.numFrames} frames)<br>
      Paging Mode:        ${this.simulator.config.pagingType}<br>
      TLB Size:           ${this.simulator.config.tlbSize} entries (${this.simulator.config.tlbAssociativity})<br>
      TLB Policy:         ${this.simulator.config.tlbPolicy}<br>
      Page Replacement:   ${this.simulator.config.memPolicy}<br>
    `);
  }

  cmdTop() {
    this.printLine(`
      <span class="term-bold term-green">top - ${new Date().toLocaleTimeString()} up 4:20, 1 user, load average: 0.12, 0.08, 0.05</span><br>
      Tasks: 2 total, 1 running, 1 sleeping, 0 stopped, 0 zombie<br>
      %Cpu(s): 2.4 us, 1.2 sy, 0.0 ni, 96.1 id, 0.3 wa<br>
      MiB Mem: 16.0 total, ${(this.simulator.memory.getUtilization().usedBytes / 1024).toFixed(1)} used, ${(this.simulator.memory.getUtilization().totalBytes - this.simulator.memory.getUtilization().usedBytes) / 1024} free<br><br>
      <span class="term-dim">PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND</span><br>
      101 ubuntu    20   0   16384   8192   2048 R   3.2  50.0   0:04.12 tlb-simulator<br>
      102 ubuntu    20   0    8192   4096   1024 S   0.1  25.0   0:00.34 bash<br>
    `);
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }
}

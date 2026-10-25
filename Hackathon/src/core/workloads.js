/**
 * Benchmark Workloads and Trace Generators for OS Memory Management
 * Provides realistic memory access traces demonstrating spatial locality, temporal locality,
 * matrix multiplication stride effects, thrashing, and multi-process interleaving.
 */

export class WorkloadGenerator {
  constructor(pageSize = 1024, maxAddress = 0xFFFF) {
    this.pageSize = pageSize;
    this.maxAddress = maxAddress;
  }

  /**
   * Spatial Locality: Sequential traversal through array elements
   * High TLB hits within pages, periodic page boundary crossings
   */
  generateSequential(count = 50, stride = 16) {
    const trace = [];
    let addr = 0x0100;
    for (let i = 0; i < count; i++) {
      trace.push({
        address: addr & this.maxAddress,
        operation: i % 4 === 0 ? 'W' : 'R',
        description: `Sequential step ${i + 1}`,
        pid: 1,
      });
      addr += stride;
    }
    return trace;
  }

  /**
   * Temporal Locality: Tight loop accessing code, stack, and heap
   * Yields high TLB hit rates after warmup
   */
  generateLoopLocality(iterations = 15) {
    const trace = [];
    const loopPages = [0x0800, 0x0810, 0x1400, 0x1420, 0x3000]; // 3 distinct pages
    for (let it = 0; it < iterations; it++) {
      loopPages.forEach((base, idx) => {
        trace.push({
          address: (base + (idx * 4)) & this.maxAddress,
          operation: idx === 2 ? 'W' : 'R',
          description: `Loop Iteration ${it + 1} (Page 0x${Math.floor(base / this.pageSize).toString(16)})`,
          pid: 1,
        });
      });
    }
    return trace;
  }

  /**
   * Matrix Multiplication: Column-Major Stride
   * Demonstrates cache/TLB misses when memory is accessed with large strides
   */
  generateMatrixStride(rows = 6, cols = 6) {
    const trace = [];
    const baseAddr = 0x0400;
    const rowStride = this.pageSize * 2; // Jump 2 pages per row!

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const addr = (baseAddr + row * rowStride + col * 4) & this.maxAddress;
        trace.push({
          address: addr,
          operation: 'R',
          description: `Matrix col-access [${row}, ${col}] (Stride ${rowStride}B)`,
          pid: 1,
        });
      }
    }
    return trace;
  }

  /**
   * Thrashing: Working set exceeds physical memory capacity
   * Causes constant page faults and disk swapping
   */
  generateThrashing(numUniquePages = 18, accesses = 40) {
    const trace = [];
    for (let i = 0; i < accesses; i++) {
      const pageIndex = i % numUniquePages;
      const addr = (pageIndex * this.pageSize + (i % 64)) & this.maxAddress;
      trace.push({
        address: addr,
        operation: i % 3 === 0 ? 'W' : 'R',
        description: `Thrashing Page 0x${pageIndex.toString(16).toUpperCase()}`,
        pid: 1,
      });
    }
    return trace;
  }

  /**
   * Uniform Random Memory Access
   * Stress tests replacement policies
   */
  generateRandom(count = 40) {
    const trace = [];
    for (let i = 0; i < count; i++) {
      const addr = Math.floor(Math.random() * (this.maxAddress + 1));
      trace.push({
        address: addr,
        operation: Math.random() > 0.7 ? 'W' : 'R',
        description: `Random memory probe #${i + 1}`,
        pid: 1,
      });
    }
    return trace;
  }

  /**
   * Multi-Process Interleaving (Context Switching)
   */
  generateMultiProcess(count = 30) {
    const trace = [];
    for (let i = 0; i < count; i++) {
      const pid = (i % 6 < 3) ? 1 : 2;
      const base = pid === 1 ? 0x1000 : 0x5000;
      const addr = (base + ((i % 4) * this.pageSize) + (i * 8)) & this.maxAddress;
      trace.push({
        address: addr,
        operation: i % 2 === 0 ? 'R' : 'W',
        description: `PID ${pid} Context Access #${i + 1}`,
        pid,
      });
    }
    return trace;
  }

  /**
   * Parse arbitrary text format into trace items
   * Supported formats:
   * 0x1A40 R
   * 1A40 W
   * 6720
   */
  parseCustomTrace(text) {
    const lines = text.split('\n');
    const trace = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const parts = line.split(/\s+/);
      const addrStr = parts[0];
      const op = parts[1] && parts[1].toUpperCase() === 'W' ? 'W' : 'R';
      const pid = parts[2] ? parseInt(parts[2], 10) || 1 : 1;

      let address = 0;
      if (addrStr.toLowerCase().startsWith('0x')) {
        address = parseInt(addrStr.slice(2), 16);
      } else if (/^[0-9a-f]+$/i.test(addrStr) && (addrStr.length > 3 || /[a-f]/i.test(addrStr))) {
        address = parseInt(addrStr, 16);
      } else {
        address = parseInt(addrStr, 10);
      }

      if (!isNaN(address)) {
        trace.push({
          address: address & this.maxAddress,
          operation: op,
          description: `Custom Line ${i + 1} (${addrStr})`,
          pid,
        });
      }
    }

    return trace;
  }
}

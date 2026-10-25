/**
 * Page Table Architecture Simulation Engine
 * Supports Single-Level Page Tables, Two-Level Hierarchical Page Tables,
 * and Inverted Page Tables with on-demand allocation and page status tracking.
 */

export class PageTableManager {
  constructor(config = {}) {
    this.updateConfig(config);
    this.reset();
  }

  updateConfig({
    pagingType = 'single', // 'single', 'two-level', 'inverted'
    numVirtualPages = 64,
    numFrames = 16,
    outerBits = 3,
    innerBits = 3,
    accessLatency = 100, // Main memory access latency in ns
  } = {}) {
    this.pagingType = pagingType;
    this.numVirtualPages = numVirtualPages;
    this.numFrames = numFrames;
    this.outerBits = outerBits;
    this.innerBits = innerBits;
    this.accessLatency = accessLatency;

    this.numOuterEntries = 1 << outerBits;
    this.numInnerEntries = 1 << innerBits;
  }

  reset() {
    this.stats = {
      lookups: 0,
      pageHits: 0,
      pageFaults: 0,
    };

    // 1. Single-level page table structure
    this.singleTable = Array.from({ length: this.numVirtualPages }, (_, vpn) => ({
      vpn,
      present: false,
      frame: null,
      dirty: false,
      referenced: false,
      readOnly: false,
      swapBlock: null,
      pid: 1,
    }));

    // 2. Two-level hierarchical structure
    // Page Directory entries point to inner page tables (allocated lazily)
    this.pageDirectory = Array.from({ length: this.numOuterEntries }, (_, dirIdx) => ({
      dirIdx,
      allocated: false,
      table: null, // will be Array(this.numInnerEntries) when allocated
    }));

    // 3. Inverted page table structure (1 entry per physical frame)
    this.invertedTable = Array.from({ length: this.numFrames }, (_, frame) => ({
      frame,
      valid: false,
      pid: null,
      vpn: null,
      dirty: false,
      referenced: false,
    }));
  }

  /**
   * Ensure inner page table exists in two-level paging
   */
  ensureInnerTable(p1) {
    if (!this.pageDirectory[p1].allocated) {
      this.pageDirectory[p1].allocated = true;
      this.pageDirectory[p1].table = Array.from({ length: this.numInnerEntries }, (_, p2) => {
        const vpn = (p1 << this.innerBits) | p2;
        return {
          vpn,
          p1,
          p2,
          present: false,
          frame: null,
          dirty: false,
          referenced: false,
          readOnly: false,
          swapBlock: null,
          pid: 1,
        };
      });
    }
    return this.pageDirectory[p1].table;
  }

  /**
   * Lookup a virtual page number in the active page table architecture
   */
  lookup(decomposedAddress, pid = 1) {
    this.stats.lookups++;
    const vpn = decomposedAddress.vpn;

    switch (this.pagingType) {
      case 'two-level': {
        const p1 = decomposedAddress.outerIndex;
        const p2 = decomposedAddress.innerIndex;
        const dirEntry = this.pageDirectory[p1];

        if (!dirEntry.allocated || !dirEntry.table) {
          // Inner page table not even allocated yet -> definitely page fault
          this.stats.pageFaults++;
          return {
            pageFault: true,
            vpn,
            frame: null,
            p1,
            p2,
            dirAllocated: false,
            entry: null,
            memoryAccessCycles: 1, // Checked page directory only
            latency: this.accessLatency,
          };
        }

        const pte = dirEntry.table[p2];
        if (pte.present) {
          this.stats.pageHits++;
          pte.referenced = true;
          return {
            pageFault: false,
            vpn,
            frame: pte.frame,
            p1,
            p2,
            dirAllocated: true,
            entry: { ...pte },
            memoryAccessCycles: 2, // Directory + Inner Table
            latency: this.accessLatency * 2,
          };
        }

        // Present bit is 0 -> Page Fault!
        this.stats.pageFaults++;
        return {
          pageFault: true,
          vpn,
          frame: null,
          p1,
          p2,
          dirAllocated: true,
          entry: { ...pte },
          memoryAccessCycles: 2,
          latency: this.accessLatency * 2,
        };
      }

      case 'inverted': {
        // Search inverted table for (pid, vpn)
        let foundFrame = -1;
        let foundEntry = null;

        for (let f = 0; f < this.numFrames; f++) {
          const entry = this.invertedTable[f];
          if (entry.valid && entry.pid === pid && entry.vpn === vpn) {
            foundFrame = f;
            foundEntry = entry;
            break;
          }
        }

        if (foundFrame !== -1) {
          this.stats.pageHits++;
          foundEntry.referenced = true;
          return {
            pageFault: false,
            vpn,
            frame: foundFrame,
            entry: { ...foundEntry },
            memoryAccessCycles: 1,
            latency: this.accessLatency,
          };
        }

        this.stats.pageFaults++;
        return {
          pageFault: true,
          vpn,
          frame: null,
          entry: null,
          memoryAccessCycles: 1,
          latency: this.accessLatency,
        };
      }

      case 'single':
      default: {
        const pte = this.singleTable[vpn] || {
          vpn,
          present: false,
          frame: null,
          dirty: false,
          referenced: false,
          readOnly: false,
          swapBlock: null,
          pid,
        };

        if (pte.present) {
          this.stats.pageHits++;
          pte.referenced = true;
          return {
            pageFault: false,
            vpn,
            frame: pte.frame,
            entry: { ...pte },
            memoryAccessCycles: 1,
            latency: this.accessLatency,
          };
        }

        this.stats.pageFaults++;
        return {
          pageFault: true,
          vpn,
          frame: null,
          entry: { ...pte },
          memoryAccessCycles: 1,
          latency: this.accessLatency,
        };
      }
    }
  }

  /**
   * Update page table when a page is mapped to a physical frame
   */
  mapPage(vpn, frame, pid = 1, isWrite = false) {
    // 1. Single-level
    if (this.singleTable[vpn]) {
      this.singleTable[vpn].present = true;
      this.singleTable[vpn].frame = frame;
      this.singleTable[vpn].referenced = true;
      if (isWrite) this.singleTable[vpn].dirty = true;
    }

    // 2. Two-level
    const p1 = (vpn >>> this.innerBits) & ((1 << this.outerBits) - 1);
    const p2 = vpn & ((1 << this.innerBits) - 1);
    const table = this.ensureInnerTable(p1);
    if (table && table[p2]) {
      table[p2].present = true;
      table[p2].frame = frame;
      table[p2].referenced = true;
      if (isWrite) table[p2].dirty = true;
    }

    // 3. Inverted
    if (this.invertedTable[frame]) {
      this.invertedTable[frame].valid = true;
      this.invertedTable[frame].pid = pid;
      this.invertedTable[frame].vpn = vpn;
      this.invertedTable[frame].referenced = true;
      if (isWrite) this.invertedTable[frame].dirty = true;
    }
  }

  /**
   * Invalidate page table entry when a page is evicted to swap disk
   */
  unmapPage(vpn, swapBlock = null) {
    // 1. Single-level
    if (this.singleTable[vpn]) {
      this.singleTable[vpn].present = false;
      this.singleTable[vpn].frame = null;
      this.singleTable[vpn].dirty = false;
      this.singleTable[vpn].referenced = false;
      this.singleTable[vpn].swapBlock = swapBlock;
    }

    // 2. Two-level
    const p1 = (vpn >>> this.innerBits) & ((1 << this.outerBits) - 1);
    const p2 = vpn & ((1 << this.innerBits) - 1);
    if (this.pageDirectory[p1] && this.pageDirectory[p1].table) {
      const pte = this.pageDirectory[p1].table[p2];
      if (pte) {
        pte.present = false;
        pte.frame = null;
        pte.dirty = false;
        pte.referenced = false;
        pte.swapBlock = swapBlock;
      }
    }

    // 3. Inverted
    for (const entry of this.invertedTable) {
      if (entry.valid && entry.vpn === vpn) {
        entry.valid = false;
        entry.pid = null;
        entry.vpn = null;
        entry.dirty = false;
        entry.referenced = false;
      }
    }
  }

  /**
   * Mark dirty bit on write access
   */
  markDirty(vpn) {
    if (this.singleTable[vpn]) this.singleTable[vpn].dirty = true;

    const p1 = (vpn >>> this.innerBits) & ((1 << this.outerBits) - 1);
    const p2 = vpn & ((1 << this.innerBits) - 1);
    if (this.pageDirectory[p1]?.table?.[p2]) {
      this.pageDirectory[p1].table[p2].dirty = true;
    }
  }

  getPageFaultRate() {
    return this.stats.lookups > 0 ? (this.stats.pageFaults / this.stats.lookups) * 100 : 0;
  }

  getStats() {
    return {
      ...this.stats,
      pageFaultRate: this.getPageFaultRate(),
    };
  }
}

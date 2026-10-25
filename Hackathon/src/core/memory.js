/**
 * Physical Memory (RAM) & Secondary Swap Space Simulation Engine
 * Manages physical frames, free lists, page fault servicing,
 * and Page Replacement Policies: LRU, FIFO, Clock (Second Chance), Optimal (MIN), and Random.
 */

export class PhysicalMemoryManager {
  constructor(config = {}) {
    this.updateConfig(config);
    this.reset();
  }

  updateConfig({
    ramSize = 16384, // 16 KB
    pageSize = 1024, // 1 KB -> 16 frames
    policy = 'LRU', // 'LRU', 'FIFO', 'Clock', 'Optimal', 'Random'
    pageFaultLatency = 8000000, // 8 ms in ns (8,000,000 ns)
    swapLatency = 10000000, // 10 ms for dirty page write-back
  } = {}) {
    this.ramSize = ramSize;
    this.pageSize = pageSize;
    this.numFrames = Math.max(2, Math.floor(ramSize / pageSize));
    this.policy = policy;
    this.pageFaultLatency = pageFaultLatency;
    this.swapLatency = swapLatency;
    this.clockHand = 0;
  }

  reset() {
    this.frames = Array.from({ length: this.numFrames }, (_, frameId) => ({
      frameId,
      occupied: false,
      vpn: null,
      pid: null,
      dirty: false,
      referenced: false,
      loadTime: 0,
      lastAccessTime: 0,
      accessCount: 0,
    }));

    // Secondary storage / Swap space (simulate 64 swap blocks)
    this.swapBlocks = Array.from({ length: 64 }, (_, blockId) => ({
      blockId,
      occupied: false,
      vpn: null,
      pid: null,
      dirty: false,
    }));

    this.stats = {
      pageFaults: 0,
      pageIns: 0,
      pageOuts: 0, // Dirty writebacks to disk
      evictions: 0,
      totalSwapLatency: 0,
    };

    this.clockHand = 0;
    this.timeCounter = 0;
  }

  /**
   * Find a free frame or select a victim frame
   * @param {number} requestedVpn - VPN causing page fault
   * @param {number} pid - Process ID
   * @param {Array} futureReferences - Optional future trace for OPT replacement
   */
  allocateFrame(requestedVpn, pid = 1, futureReferences = []) {
    this.timeCounter++;
    this.stats.pageFaults++;
    this.stats.pageIns++;

    // 1. Check for an empty / unoccupied frame
    for (const frame of this.frames) {
      if (!frame.occupied) {
        frame.occupied = true;
        frame.vpn = requestedVpn;
        frame.pid = pid;
        frame.dirty = false;
        frame.referenced = true;
        frame.loadTime = this.timeCounter;
        frame.lastAccessTime = this.timeCounter;
        frame.accessCount = 1;

        return {
          frameId: frame.frameId,
          evicted: null,
          dirtyWriteback: false,
          serviceLatency: this.pageFaultLatency,
        };
      }
    }

    // 2. RAM is fully saturated! Select victim frame
    const victimIndex = this.selectVictimFrame(futureReferences);
    const victim = this.frames[victimIndex];
    this.stats.evictions++;

    const evictedCopy = { ...victim };
    let dirtyWriteback = false;
    let extraLatency = 0;

    // 3. If victim was modified (dirty), must write back to swap disk!
    if (victim.dirty) {
      this.stats.pageOuts++;
      dirtyWriteback = true;
      extraLatency = this.swapLatency;
      this.writeToSwap(victim.vpn, victim.pid);
    }

    // 4. Overwrite frame with newly demanded page
    victim.occupied = true;
    victim.vpn = requestedVpn;
    victim.pid = pid;
    victim.dirty = false;
    victim.referenced = true;
    victim.loadTime = this.timeCounter;
    victim.lastAccessTime = this.timeCounter;
    victim.accessCount = 1;

    const totalServiceLatency = this.pageFaultLatency + extraLatency;
    this.stats.totalSwapLatency += totalServiceLatency;

    return {
      frameId: victim.frameId,
      evicted: evictedCopy,
      dirtyWriteback,
      serviceLatency: totalServiceLatency,
    };
  }

  /**
   * Select victim frame using the chosen replacement algorithm
   */
  selectVictimFrame(futureReferences = []) {
    switch (this.policy) {
      case 'FIFO': {
        // Frame with minimum loadTime
        let oldest = 0;
        let minLoad = this.frames[0].loadTime;
        for (let i = 1; i < this.numFrames; i++) {
          if (this.frames[i].loadTime < minLoad) {
            minLoad = this.frames[i].loadTime;
            oldest = i;
          }
        }
        return oldest;
      }

      case 'Clock': {
        // Second chance / clock algorithm
        let count = 0;
        const maxChecks = this.numFrames * 2 + 1;
        while (count < maxChecks) {
          const current = this.clockHand % this.numFrames;
          const frame = this.frames[current];
          this.clockHand = (this.clockHand + 1) % this.numFrames;

          if (frame.referenced) {
            frame.referenced = false; // Give second chance
          } else {
            return current; // Found victim
          }
          count++;
        }
        return 0; // Fallback
      }

      case 'Optimal': {
        // Belady's Optimal (MIN) Algorithm
        // Select the frame holding a page that will not be used for the longest time
        if (!futureReferences || futureReferences.length === 0) {
          // If no future knowledge, fallback to LRU
          return this.selectLruVictim();
        }

        let farthestIndex = -1;
        let maxDistance = -1;

        for (let i = 0; i < this.numFrames; i++) {
          const vpn = this.frames[i].vpn;
          let nextUse = futureReferences.findIndex(ref => ref.vpn === vpn);

          if (nextUse === -1) {
            // This page is NEVER used again in the future! Perfect victim.
            return i;
          }

          if (nextUse > maxDistance) {
            maxDistance = nextUse;
            farthestIndex = i;
          }
        }

        return farthestIndex !== -1 ? farthestIndex : 0;
      }

      case 'Random': {
        return Math.floor(Math.random() * this.numFrames);
      }

      case 'LRU':
      default: {
        return this.selectLruVictim();
      }
    }
  }

  selectLruVictim() {
    let lru = 0;
    let minAccess = this.frames[0].lastAccessTime;
    for (let i = 1; i < this.numFrames; i++) {
      if (this.frames[i].lastAccessTime < minAccess) {
        minAccess = this.frames[i].lastAccessTime;
        lru = i;
      }
    }
    return lru;
  }

  /**
   * Record access to an already resident frame
   */
  accessFrame(frameId, isWrite = false) {
    this.timeCounter++;
    if (this.frames[frameId] && this.frames[frameId].occupied) {
      const f = this.frames[frameId];
      f.lastAccessTime = this.timeCounter;
      f.accessCount++;
      f.referenced = true;
      if (isWrite) {
        f.dirty = true;
      }
      return true;
    }
    return false;
  }

  /**
   * Save dirty page to swap disk
   */
  writeToSwap(vpn, pid = 1) {
    // Check if already in swap
    for (const b of this.swapBlocks) {
      if (b.occupied && b.vpn === vpn && b.pid === pid) {
        b.dirty = false;
        return b.blockId;
      }
    }
    // Allocate new swap block
    for (const b of this.swapBlocks) {
      if (!b.occupied) {
        b.occupied = true;
        b.vpn = vpn;
        b.pid = pid;
        b.dirty = false;
        return b.blockId;
      }
    }
    return 0;
  }

  getFrames() {
    return this.frames.map(f => ({ ...f }));
  }

  getSwapBlocks() {
    return this.swapBlocks.map(b => ({ ...b }));
  }

  getUtilization() {
    const used = this.frames.filter(f => f.occupied).length;
    return {
      usedFrames: used,
      totalFrames: this.numFrames,
      usedBytes: used * this.pageSize,
      totalBytes: this.ramSize,
      percentage: (used / this.numFrames) * 100,
    };
  }
}

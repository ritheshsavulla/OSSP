/**
 * Translation Lookaside Buffer (TLB) Simulation Engine
 * Supports Fully Associative and Set Associative architectures,
 * with LRU, FIFO, Clock (Second Chance), Random, and LFU replacement policies.
 */

export class TLB {
  constructor(config = {}) {
    this.updateConfig(config);
    this.reset();
  }

  updateConfig({
    size = 8, // Total entries (e.g., 4, 8, 16, 32)
    associativity = 'fully', // 'fully', '2-way', '4-way'
    policy = 'LRU', // 'LRU', 'FIFO', 'Clock', 'Random', 'LFU'
    accessLatency = 1, // ns
  } = {}) {
    this.size = size;
    this.associativity = associativity;
    this.policy = policy;
    this.accessLatency = accessLatency;

    if (associativity === '2-way') {
      this.ways = 2;
      this.numSets = Math.max(1, Math.floor(size / 2));
    } else if (associativity === '4-way') {
      this.ways = 4;
      this.numSets = Math.max(1, Math.floor(size / 4));
    } else {
      this.ways = size;
      this.numSets = 1; // 1 set containing all entries
    }

    this.clockHand = 0;
  }

  reset() {
    this.entries = Array.from({ length: this.size }, (_, index) => ({
      index,
      valid: false,
      tag: null, // VPN
      frame: null,
      pid: 1,
      dirty: false,
      ref: false,
      lastAccessTime: 0,
      insertionTime: 0,
      accessCount: 0,
    }));

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      flushes: 0,
    };

    this.timeCounter = 0;
    this.clockHand = 0;
    this.lastLookupResult = null;
  }

  /**
   * Determine set index and tag for a VPN based on associativity
   */
  getSetAndTag(vpn) {
    if (this.associativity === 'fully') {
      return { setIndex: 0, tag: vpn, waySize: this.size, startIndex: 0 };
    }
    const setIndex = vpn % this.numSets;
    const tag = Math.floor(vpn / this.numSets);
    const startIndex = setIndex * this.ways;
    return { setIndex, tag, waySize: this.ways, startIndex };
  }

  /**
   * Perform parallel TLB lookup for a given VPN
   */
  lookup(vpn, pid = 1, isWrite = false) {
    this.timeCounter++;
    const { setIndex, tag, waySize, startIndex } = this.getSetAndTag(vpn);

    let hitIndex = -1;
    let hitEntry = null;

    // Search within target set
    for (let i = 0; i < waySize; i++) {
      const idx = startIndex + i;
      const entry = this.entries[idx];
      if (entry.valid && entry.tag === tag && entry.pid === pid) {
        hitIndex = idx;
        hitEntry = entry;
        break;
      }
    }

    if (hitIndex !== -1) {
      // TLB HIT
      this.stats.hits++;
      hitEntry.lastAccessTime = this.timeCounter;
      hitEntry.accessCount++;
      hitEntry.ref = true;
      if (isWrite) {
        hitEntry.dirty = true;
      }

      this.lastLookupResult = {
        hit: true,
        vpn,
        tag,
        frame: hitEntry.frame,
        index: hitIndex,
        setIndex,
        entry: { ...hitEntry },
        latency: this.accessLatency,
      };
      return this.lastLookupResult;
    }

    // TLB MISS
    this.stats.misses++;
    this.lastLookupResult = {
      hit: false,
      vpn,
      tag,
      frame: null,
      index: -1,
      setIndex,
      entry: null,
      latency: this.accessLatency,
    };
    return this.lastLookupResult;
  }

  /**
   * Insert or update an entry in the TLB upon page table resolution
   */
  insert(vpn, frame, pid = 1, isWrite = false) {
    this.timeCounter++;
    const { setIndex, tag, waySize, startIndex } = this.getSetAndTag(vpn);

    // 1. Check if already present in this set (just update)
    for (let i = 0; i < waySize; i++) {
      const idx = startIndex + i;
      const entry = this.entries[idx];
      if (entry.valid && entry.tag === tag && entry.pid === pid) {
        entry.frame = frame;
        entry.lastAccessTime = this.timeCounter;
        entry.accessCount++;
        entry.ref = true;
        if (isWrite) entry.dirty = true;
        return { replaced: false, index: idx, evicted: null, entry: { ...entry } };
      }
    }

    // 2. Check for an empty / invalid slot in this set
    for (let i = 0; i < waySize; i++) {
      const idx = startIndex + i;
      const entry = this.entries[idx];
      if (!entry.valid) {
        entry.valid = true;
        entry.tag = tag;
        entry.frame = frame;
        entry.pid = pid;
        entry.dirty = !!isWrite;
        entry.ref = true;
        entry.insertionTime = this.timeCounter;
        entry.lastAccessTime = this.timeCounter;
        entry.accessCount = 1;
        return { replaced: false, index: idx, evicted: null, entry: { ...entry } };
      }
    }

    // 3. Set is full! Must select a victim based on replacement policy
    const victimIdx = this.selectVictim(startIndex, waySize);
    const evicted = { ...this.entries[victimIdx] };
    this.stats.evictions++;

    const entry = this.entries[victimIdx];
    entry.valid = true;
    entry.tag = tag;
    entry.frame = frame;
    entry.pid = pid;
    entry.dirty = !!isWrite;
    entry.ref = true;
    entry.insertionTime = this.timeCounter;
    entry.lastAccessTime = this.timeCounter;
    entry.accessCount = 1;

    return {
      replaced: true,
      index: victimIdx,
      evicted,
      entry: { ...entry },
    };
  }

  /**
   * Select victim index within a set based on policy
   */
  selectVictim(startIndex, waySize) {
    const candidates = [];
    for (let i = 0; i < waySize; i++) {
      candidates.push(startIndex + i);
    }

    switch (this.policy) {
      case 'FIFO': {
        // Find minimum insertionTime
        let oldestIdx = candidates[0];
        let minTime = this.entries[oldestIdx].insertionTime;
        for (const idx of candidates) {
          if (this.entries[idx].insertionTime < minTime) {
            minTime = this.entries[idx].insertionTime;
            oldestIdx = idx;
          }
        }
        return oldestIdx;
      }

      case 'Clock': {
        // Second chance algorithm on the set
        let count = 0;
        const maxChecks = waySize * 2 + 1;
        while (count < maxChecks) {
          const currentPos = (this.clockHand % waySize);
          const idx = startIndex + currentPos;
          const entry = this.entries[idx];
          this.clockHand = (this.clockHand + 1) % waySize;

          if (entry.ref) {
            entry.ref = false; // Give second chance
          } else {
            return idx; // Found victim
          }
          count++;
        }
        return startIndex; // Fallback
      }

      case 'LFU': {
        // Smallest access count
        let leastIdx = candidates[0];
        let minCount = this.entries[leastIdx].accessCount;
        for (const idx of candidates) {
          if (this.entries[idx].accessCount < minCount) {
            minCount = this.entries[idx].accessCount;
            leastIdx = idx;
          }
        }
        return leastIdx;
      }

      case 'Random': {
        const rand = Math.floor(Math.random() * waySize);
        return candidates[rand];
      }

      case 'LRU':
      default: {
        // Smallest lastAccessTime
        let lruIdx = candidates[0];
        let minTime = this.entries[lruIdx].lastAccessTime;
        for (const idx of candidates) {
          if (this.entries[idx].lastAccessTime < minTime) {
            minTime = this.entries[idx].lastAccessTime;
            lruIdx = idx;
          }
        }
        return lruIdx;
      }
    }
  }

  /**
   * Invalidate TLB entry for a given VPN (e.g. on page eviction / TLB shootdown)
   */
  invalidate(vpn, pid = 1) {
    const { setIndex, tag, waySize, startIndex } = this.getSetAndTag(vpn);
    for (let i = 0; i < waySize; i++) {
      const idx = startIndex + i;
      const entry = this.entries[idx];
      if (entry.valid && entry.tag === tag && entry.pid === pid) {
        entry.valid = false;
        entry.tag = null;
        entry.frame = null;
        entry.dirty = false;
        entry.ref = false;
        return true;
      }
    }
    return false;
  }

  /**
   * Flush entire TLB (e.g. on context switch)
   */
  flush() {
    this.entries.forEach(e => {
      e.valid = false;
      e.tag = null;
      e.frame = null;
      e.dirty = false;
      e.ref = false;
    });
    this.stats.flushes++;
  }

  getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      total,
      hitRate: this.getHitRate(),
      missRate: total > 0 ? (this.stats.misses / total) * 100 : 0,
    };
  }

  getEntries() {
    return this.entries.map(e => ({ ...e }));
  }
}

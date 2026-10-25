/**
 * OS Architectural Handbook & Hackathon Presentation Guide
 * Interactive educational reference documentation for judges, students, and engineers.
 */

export class DocsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="docs-wrapper">
        <div class="docs-sidebar">
          <ul class="docs-nav">
            <li class="active"><a href="#doc-overview">1. Executive Overview</a></li>
            <li><a href="#doc-pipeline">2. Translation Pipeline</a></li>
            <li><a href="#doc-tlb">3. TLB & Associativity</a></li>
            <li><a href="#doc-pagetable">4. Hierarchical Paging</a></li>
            <li><a href="#doc-pagefault">5. Page Fault & Eviction</a></li>
            <li><a href="#doc-eat">6. Mathematical EAT Model</a></li>
            <li><a href="#doc-cli">7. Ubuntu Bash CLI Guide</a></li>
          </ul>
        </div>

        <div class="docs-content">
          <section id="doc-overview" class="doc-section">
            <h2>1. Executive Overview: OS Virtual Memory Subsystem</h2>
            <p>
              In modern computing systems, virtual memory abstracts physical RAM away from processes, providing 
              memory isolation, protection, and the illusion of contiguous, limitless memory. However, translating
              every memory access through software or multi-level page tables imposes severe memory bandwidth penalties.
            </p>
            <p>
              This simulator models the complete hardware/software symbiosis between the <strong>CPU</strong>, 
              the <strong>Translation Lookaside Buffer (TLB)</strong>, <strong>Single/Multi-Level/Inverted Page Tables</strong>,
              and <strong>Physical RAM Frames with Secondary Swap Space</strong>.
            </p>
            <div class="doc-callout">
              <strong>Hackathon Highlights:</strong>
              <ul>
                <li>Simulates real-world hardware parallelism with Content Addressable Memory (CAM).</li>
                <li>Supports 5 replacement policies: LRU, FIFO, Clock (Second Chance), Belady's Optimal, and Random.</li>
                <li>Emulates dirty page writeback to swap storage and TLB shootdown.</li>
                <li>Full Ubuntu 24.04 desktop environment with draggable windows and interactive bash shell.</li>
              </ul>
            </div>
          </section>

          <section id="doc-pipeline" class="doc-section">
            <h2>2. Hardware Translation Pipeline</h2>
            <p>Every time the CPU requests an instruction or data word at a logical address:</p>
            <ol class="doc-ordered-list">
              <li><strong>Decomposition:</strong> Address is split into <em>Virtual Page Number (VPN)</em> and <em>Offset</em>:
                <code>VPN = LogicalAddress >> log2(PageSize)</code>, <code>Offset = LogicalAddress & (PageSize - 1)</code>.
              </li>
              <li><strong>TLB Fast Path:</strong> The TLB queries its high-speed CAM associative array for the VPN.
                <ul>
                  <li><strong>TLB Hit:</strong> Frame number is resolved in ~1 ns! Offset is appended to form the Physical Address directly. Main memory is accessed once.</li>
                  <li><strong>TLB Miss:</strong> CPU must walk the Page Table in main memory, incurring memory reference latency.</li>
                </ul>
              </li>
              <li><strong>Page Table Walk:</strong> The Page Table Entry (PTE) is consulted.
                <ul>
                  <li><strong>Page Hit (Present=1):</strong> Frame number is retrieved, loaded into the TLB for future accesses, and RAM accessed.</li>
                  <li><strong>Page Fault (Present=0):</strong> Hardware raises a page fault trap to the OS kernel.</li>
                </ul>
              </li>
              <li><strong>Page Fault ISR:</strong> The OS kernel suspends the process, allocates a free frame or evicts a victim frame via replacement policy, writes back dirty frames to disk, reads the page from swap disk, and updates the PTE and TLB.</li>
            </ol>
          </section>

          <section id="doc-tlb" class="doc-section">
            <h2>3. Translation Lookaside Buffer (TLB)</h2>
            <p>
              The TLB is a dedicated, ultra-fast hardware cache located directly on the CPU die.
            </p>
            <table class="yaru-table doc-table">
              <thead>
                <tr>
                  <th>Associativity</th>
                  <th>Hardware Implementation</th>
                  <th>Trade-off</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Fully Associative</strong></td>
                  <td>Every entry has its own parallel comparator (CAM)</td>
                  <td>Zero conflict misses; expensive circuit area; typical for small TLBs (8-64 entries).</td>
                </tr>
                <tr>
                  <td><strong>Set Associative</strong></td>
                  <td>VPN is hashed to a set; parallel comparison only within the set</td>
                  <td>Balances hardware cost with low conflict rate; standard in larger L2 TLBs.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="doc-pagetable" class="doc-section">
            <h2>4. Single-Level vs Hierarchical vs Inverted Paging</h2>
            <p>
              In a flat 32-bit system with 4 KB pages, a single-level page table requires $2^{20} = 1,048,576$ entries (4 MB per process!).
              In a 64-bit system, a flat table is physically impossible.
            </p>
            <ul>
              <li><strong>Two-Level Hierarchical Paging:</strong> Virtual address is partitioned into P1 (Page Directory), P2 (Page Table), and Offset. Inner tables are only allocated when virtual memory is actually touched. Empty address space costs 0 bytes of RAM!</li>
              <li><strong>Inverted Page Table:</strong> Has exactly 1 entry per physical RAM frame. Table size is fixed and independent of virtual address space, indexed by <code>(PID, VPN)</code>.</li>
            </ul>
          </section>

          <section id="doc-pagefault" class="doc-section">
            <h2>5. Page Replacement & Dirty Page Writebacks</h2>
            <p>
              When Physical RAM is exhausted and a page fault occurs, the OS must choose a victim:
            </p>
            <ul>
              <li><strong>LRU (Least Recently Used):</strong> Evicts the frame unreferenced for the longest time. High temporal fidelity.</li>
              <li><strong>Clock / Second Chance:</strong> Approximates LRU using a single reference bit and a circular clock hand. Simple, high-speed hardware implementation.</li>
              <li><strong>Optimal (Belady's MIN):</strong> Replaces the page not needed for the longest future duration. Serves as the theoretical gold standard.</li>
              <li><strong>Dirty Bit Optimization:</strong> If a victim frame's dirty bit is 0, it is discarded immediately with zero disk write overhead! If dirty bit is 1, it must be written to Swap storage first.</li>
            </ul>
          </section>

          <section id="doc-eat" class="doc-section">
            <h2>6. Effective Access Time (EAT) Mathematical Model</h2>
            <div class="formula-box">
              <code>EAT = α · (t_TLB + t_RAM) + (1 - α) · [ t_TLB + (1 - p) · (k · t_RAM + t_RAM) + p · (t_Disk + t_RAM) ]</code>
            </div>
            <p>
              Where:
              <br>• <code>α</code> = TLB Hit Ratio
              <br>• <code>p</code> = Page Fault Rate
              <br>• <code>k</code> = Page Table Tree Depth (levels)
              <br>• <code>t_TLB</code> = TLB lookup time (~1 ns)
              <br>• <code>t_RAM</code> = Physical memory access time (~100 ns)
              <br>• <code>t_Disk</code> = Page fault disk service time (~8 ms = 8,000,000 ns)
            </p>
            <p>
              <strong>The Page Fault Cliff:</strong> Because disk access is 80,000x slower than RAM, even a 0.1% page fault rate
              degrades Effective Access Time from 100 ns to over 8,000 ns (an 80x slowdown)!
            </p>
          </section>

          <section id="doc-cli" class="doc-section">
            <h2>7. Ubuntu Bash CLI Reference</h2>
            <p>Press <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd> to open the Ubuntu Terminal anytime.</p>
            <ul>
              <li><code>translate 0x1A40 W</code> - Translate logical address 0x1A40 with write operation.</li>
              <li><code>tlb</code> - View live TLB entries and CAM status.</li>
              <li><code>tlb --flush</code> - Invalidate entire TLB cache.</li>
              <li><code>ptable</code> - Dump active page table entries.</li>
              <li><code>meminfo</code> - Check physical frame allocation and swap status.</li>
              <li><code>run matrix</code> - Run the matrix multiplication stride workload.</li>
              <li><code>run thrash</code> - Demonstrate memory thrashing.</li>
              <li><code>eat</code> - Calculate live theoretical and empirical EAT.</li>
            </ul>
          </section>
        </div>
      </div>
    `;
  }
}

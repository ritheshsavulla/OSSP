/**
 * Main Application Bootstrap
 * Orchestrates the MemorySimulator engine, WindowManager, and all Ubuntu GUI views.
 */

import { MemorySimulator } from './core/simulator.js';
import { WindowManager } from './ui/windowManager.js';
import { PipelineVisualizer } from './ui/pipelineVisualizer.js';
import { TLBView } from './ui/tlbView.js';
import { PageTableView } from './ui/pageTableView.js';
import { MemoryView } from './ui/memoryView.js';
import { TerminalEmulator } from './ui/terminal.js';
import { AnalyticsView } from './ui/analyticsView.js';
import { WorkloadsView } from './ui/workloadsView.js';
import { ConfigModal } from './ui/configModal.js';
import { DocsView } from './ui/docsView.js';
import { sound } from './ui/audio.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Engine
  const simulator = new MemorySimulator({
    addressBits: 16,
    pageSize: 1024, // 1 KB
    ramSize: 16384, // 16 KB (16 frames)
    tlbSize: 8,
    tlbAssociativity: 'fully',
    tlbPolicy: 'LRU',
    pagingType: 'single',
    memPolicy: 'LRU',
    tlbLatency: 1, // ns
    ramLatency: 100, // ns
    pageFaultLatency: 8000000, // 8 ms
  });

  // 2. Initialize Desktop Window Manager
  const wm = new WindowManager();

  const windowIds = [
    'pipeline-win',
    'tlb-win',
    'ptable-win',
    'memory-win',
    'terminal-win',
    'analytics-win',
    'workloads-win',
    'config-win',
    'docs-win',
  ];

  windowIds.forEach(id => wm.registerWindow(id));

  // 3. Initialize View Components
  const pipelineView = new PipelineVisualizer('pipeline-view-root', simulator);
  const tlbView = new TLBView('tlb-view-root', simulator);
  const ptableView = new PageTableView('ptable-view-root', simulator);
  const memoryView = new MemoryView('memory-view-root', simulator);
  const terminalView = new TerminalEmulator('terminal-view-root', simulator);
  const analyticsView = new AnalyticsView('analytics-view-root', simulator);
  const workloadsView = new WorkloadsView('workloads-view-root', simulator);
  const configModal = new ConfigModal('config-view-root', simulator);
  const docsView = new DocsView('docs-view-root');

  // 4. Initial Window Placement & Focus
  // Ensure pipeline-win is focused
  wm.bringToFront('pipeline-win');

  // 5. Sound Effects Control in Top Bar & Menu
  const soundBtn = document.getElementById('topbar-sound-btn');
  const soundIcon = document.getElementById('sound-icon');
  const menuSoundBtn = document.getElementById('btn-toggle-sound-menu');
  const menuSoundText = document.getElementById('menu-sound-text');

  const updateSoundUI = (muted) => {
    soundIcon.textContent = muted ? '🔇' : '🔊';
    menuSoundText.textContent = muted ? '🔇 Sound Effects: Muted' : '🔊 Sound Effects: Enabled';
  };

  const toggleSound = () => {
    const isMuted = sound.toggleMute();
    updateSoundUI(isMuted);
  };

  soundBtn.addEventListener('click', toggleSound);
  menuSoundBtn.addEventListener('click', toggleSound);

  // 6. Dock "Show Applications" button
  const showAppsBtn = document.getElementById('btn-show-apps');
  showAppsBtn.addEventListener('click', () => {
    sound.playStep();
    // Toggle between minimizing all or restoring core windows
    const anyVisible = Array.from(wm.windows.values()).some(w => w.el.style.display !== 'none');
    if (anyVisible) {
      windowIds.forEach(id => wm.minimizeWindow(id));
    } else {
      wm.openWindow('pipeline-win');
      wm.openWindow('tlb-win');
      wm.openWindow('terminal-win');
    }
  });

  // 7. Global Spacebar shortcut to step simulation
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      sound.playStep();
      simulator.stepNext();
    }
  });

  // 8. Load default starter trace (Loop Locality) into simulator
  const starterTrace = simulator.workloads.generateLoopLocality(10);
  simulator.loadTrace(starterTrace);

  // Update Top Bar active app name when window changes
  simulator.subscribe('configChange', (cfg) => {
    const appTitle = document.getElementById('active-app-title');
    if (appTitle) {
      appTitle.textContent = `TLB (${cfg.tlbPolicy}) & ${cfg.pagingType.toUpperCase()} Page Table`;
    }
  });

  console.log('🚀 Ubuntu Web TLB & Page Table Simulator initialized successfully!');
});

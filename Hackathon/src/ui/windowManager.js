/**
 * Ubuntu GNOME Desktop Window Manager
 * Handles draggable, resizable, minimizable, and maximizable windows,
 * z-index stacking, dock integration, top panel indicators, and keyboard shortcuts.
 */

export class WindowManager {
  constructor() {
    this.windows = new Map();
    this.topZIndex = 100;
    this.activeWindowId = null;
    this.theme = 'yaru-dark'; // 'yaru-dark', 'yaru-aubergine', 'yaru-light'

    this.initDesktopEvents();
    this.initClock();
  }

  registerWindow(id, options = {}) {
    const el = document.getElementById(id);
    if (!el) return null;

    const winData = {
      id,
      el,
      title: options.title || el.dataset.title || 'Window',
      icon: options.icon || el.dataset.icon || 'window',
      minimized: false,
      maximized: false,
      prevBounds: null,
      dockBtn: document.querySelector(`[data-app="${id}"]`),
    };

    this.windows.set(id, winData);
    this.makeDraggable(winData);
    this.makeResizable(winData);
    this.attachWindowControls(winData);

    el.addEventListener('mousedown', () => this.bringToFront(id));
    if (winData.dockBtn) {
      winData.dockBtn.addEventListener('click', () => this.toggleWindow(id));
    }

    return winData;
  }

  bringToFront(id) {
    const win = this.windows.get(id);
    if (!win) return;

    this.topZIndex += 2;
    win.el.style.zIndex = this.topZIndex;

    this.windows.forEach(w => {
      w.el.classList.remove('active-window');
    });
    win.el.classList.add('active-window');
    this.activeWindowId = id;

    if (win.dockBtn) {
      document.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active-app'));
      win.dockBtn.classList.add('active-app');
    }
  }

  openWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.el.style.display = 'flex';
    win.minimized = false;
    win.el.classList.remove('minimized');
    if (win.dockBtn) {
      win.dockBtn.classList.add('running');
    }
    this.bringToFront(id);
  }

  closeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.el.style.display = 'none';
    if (win.dockBtn) {
      win.dockBtn.classList.remove('running', 'active-app');
    }
  }

  minimizeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.minimized = true;
    win.el.classList.add('minimized');
    win.el.style.display = 'none';
    if (win.dockBtn) {
      win.dockBtn.classList.remove('active-app');
    }
  }

  toggleMaximize(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (win.maximized) {
      // Restore previous bounds
      win.maximized = false;
      win.el.classList.remove('maximized');
      if (win.prevBounds) {
        win.el.style.top = win.prevBounds.top;
        win.el.style.left = win.prevBounds.left;
        win.el.style.width = win.prevBounds.width;
        win.el.style.height = win.prevBounds.height;
      }
    } else {
      // Maximize
      win.prevBounds = {
        top: win.el.style.top,
        left: win.el.style.left,
        width: win.el.style.width,
        height: win.el.style.height,
      };
      win.maximized = true;
      win.el.classList.add('maximized');
      win.el.style.top = '32px'; // Below topbar
      win.el.style.left = '64px'; // Right of dock
      win.el.style.width = 'calc(100vw - 64px)';
      win.el.style.height = 'calc(100vh - 32px)';
    }
    this.bringToFront(id);
  }

  toggleWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (win.el.style.display === 'none' || win.minimized) {
      this.openWindow(id);
    } else if (this.activeWindowId === id) {
      this.minimizeWindow(id);
    } else {
      this.bringToFront(id);
    }
  }

  attachWindowControls(win) {
    const closeBtn = win.el.querySelector('.win-btn-close');
    const minBtn = win.el.querySelector('.win-btn-minimize');
    const maxBtn = win.el.querySelector('.win-btn-maximize');
    const header = win.el.querySelector('.window-header');

    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.closeWindow(win.id); });
    if (minBtn) minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.minimizeWindow(win.id); });
    if (maxBtn) maxBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMaximize(win.id); });

    if (header) {
      header.addEventListener('dblclick', () => this.toggleMaximize(win.id));
    }
  }

  makeDraggable(win) {
    const header = win.el.querySelector('.window-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onMouseDown = (e) => {
      if (e.target.closest('.window-controls') || win.maximized) return;
      isDragging = true;
      this.bringToFront(win.id);

      startX = e.clientX;
      startY = e.clientY;

      const rect = win.el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = Math.max(64, initialLeft + dx);
      let newTop = Math.max(32, initialTop + dy);

      win.el.style.left = `${newLeft}px`;
      win.el.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
    };

    header.addEventListener('mousedown', onMouseDown);
  }

  makeResizable(win) {
    const handles = win.el.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
      let isResizing = false;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;
      const direction = handle.dataset.direction;

      handle.addEventListener('mousedown', (e) => {
        if (win.maximized) return;
        e.stopPropagation();
        isResizing = true;
        this.bringToFront(win.id);

        startX = e.clientX;
        startY = e.clientY;
        const rect = win.el.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;

        const onMouseMove = (ev) => {
          if (!isResizing) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (direction.includes('e')) {
            win.el.style.width = `${Math.max(380, startW + dx)}px`;
          }
          if (direction.includes('s')) {
            win.el.style.height = `${Math.max(260, startH + dy)}px`;
          }
        };

        const onMouseUp = () => {
          isResizing = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  initDesktopEvents() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl + Alt + T -> Open Terminal
      if (e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        this.openWindow('terminal-win');
      }
    });

    // Quick Settings Menu Toggle
    const qsBtn = document.getElementById('quick-settings-btn');
    const qsMenu = document.getElementById('quick-settings-menu');
    if (qsBtn && qsMenu) {
      qsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        qsMenu.classList.toggle('visible');
      });
      document.addEventListener('click', (e) => {
        if (!qsMenu.contains(e.target)) {
          qsMenu.classList.remove('visible');
        }
      });
    }

    // Calendar Popup Toggle
    const clockBtn = document.getElementById('panel-clock');
    const calMenu = document.getElementById('calendar-popup');
    if (clockBtn && calMenu) {
      clockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        calMenu.classList.toggle('visible');
      });
      document.addEventListener('click', (e) => {
        if (!calMenu.contains(e.target)) {
          calMenu.classList.remove('visible');
        }
      });
    }

    // Theme selector
    const themeBtns = document.querySelectorAll('[data-theme-choice]');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.themeChoice;
        document.body.className = theme;
        this.theme = theme;
      });
    });
  }

  initClock() {
    const clockEl = document.getElementById('panel-clock-time');
    const calDateEl = document.getElementById('cal-today-date');

    const updateTime = () => {
      const now = new Date();
      const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      if (clockEl) {
        clockEl.textContent = now.toLocaleDateString('en-US', options).replace(',', '');
      }
      if (calDateEl) {
        calDateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    };

    updateTime();
    setInterval(updateTime, 1000);
  }
}

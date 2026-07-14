/* ============================================================
   Help dialog — small ? icon top-right; hover reveals a panel listing
   all keyboard shortcuts. Each row is also clickable: clicking triggers
   the same action as pressing the shortcut.

   The panel auto-hides when the cursor leaves both the icon and the panel
   (with a small grace delay so you can move from one to the other).

   The icon is intentionally tucked into the top-right corner away from
   typical interaction zones (slide content, navigation arrows, mute
   button, progress bar) so the talk isn't disrupted by accidental hovers.
   ============================================================ */
(function () {
  const ACTIONS = [
    { keys: ['→', 'Space'], label: 'Next slide / fragment', action: 'next' },
    { keys: ['←'],          label: 'Previous',              action: 'prev' },
    { keys: ['F'],          label: 'Toggle fullscreen',     action: 'fullscreen' },
    { keys: ['S'],          label: 'Speaker notes',         action: 'notes' },
    { keys: ['O', 'Esc'],   label: 'Overview',              action: 'overview' },
    { keys: ['B'],          label: 'Black out',             action: 'blackout' },
    { keys: ['M'],          label: 'Toggle mute',           action: 'mute' },
    { keys: ['+'],          label: 'Volume up',             action: 'vol-up' },
    { keys: ['−'],          label: 'Volume down',           action: 'vol-down' }
  ];

  function trigger(action) {
    const R = window.Reveal;
    switch (action) {
      case 'next':       R && R.next();              break;
      case 'prev':       R && R.prev();              break;
      case 'overview':   R && R.toggleOverview();    break;
      case 'blackout':   R && R.togglePause();       break;
      case 'fullscreen': toggleFullscreen();         break;
      case 'notes':      openNotes();                break;
      case 'mute':       window.AllStaffAudio && window.AllStaffAudio.toggleMute(); break;
      case 'vol-up':     window.AllStaffAudio && window.AllStaffAudio.bumpVolume(+0.05); break;
      case 'vol-down':   window.AllStaffAudio && window.AllStaffAudio.bumpVolume(-0.05); break;
    }
  }
  function toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    } else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    }
  }
  function openNotes() {
    try {
      const p = window.Reveal && window.Reveal.getPlugin && window.Reveal.getPlugin('notes');
      if (p && typeof p.open === 'function') {
        p.open();
        return;
      }
    } catch (_) { /* fall through */ }
    // Fallback: dispatch synthetic 'S' keydown. Most browsers honour this for
    // listeners, but not for window.open invoked from the same event chain
    // because isTrusted=false → popups may be blocked. Best-effort only.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', keyCode: 83 }));
  }

  function buildUI() {
    if (document.getElementById('help-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'help-icon';
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', 'Keyboard shortcuts');
    icon.title = 'Keyboard shortcuts';
    icon.textContent = '?';

    const dialog = document.createElement('div');
    dialog.id = 'help-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Keyboard shortcuts');

    const title = document.createElement('div');
    title.className = 'hd-title';
    title.textContent = 'Keyboard shortcuts';
    dialog.appendChild(title);

    const list = document.createElement('div');
    list.className = 'hd-list';
    ACTIONS.forEach((a) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hd-row';
      row.dataset.action = a.action;

      const kbds = document.createElement('span');
      kbds.className = 'hd-keys';
      a.keys.forEach((k, i) => {
        if (i > 0) kbds.appendChild(document.createTextNode(' '));
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        kbds.appendChild(kbd);
      });
      row.appendChild(kbds);

      const lbl = document.createElement('span');
      lbl.className = 'hd-label';
      lbl.textContent = a.label;
      row.appendChild(lbl);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger(a.action);
      });
      list.appendChild(row);
    });
    dialog.appendChild(list);

    document.body.appendChild(icon);
    document.body.appendChild(dialog);

    /* ----- hover handling: show on enter, hide after leaving both ----- */
    let hideTimer = null;
    function show() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      dialog.classList.add('open');
      icon.classList.add('open');
    }
    function scheduleHide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        dialog.classList.remove('open');
        icon.classList.remove('open');
        hideTimer = null;
      }, 220);
    }
    icon.addEventListener('mouseenter', show);
    icon.addEventListener('mouseleave', scheduleHide);
    dialog.addEventListener('mouseenter', show);
    dialog.addEventListener('mouseleave', scheduleHide);
    // Tapping the icon on touch devices toggles the dialog
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dialog.classList.contains('open')) scheduleHide();
      else show();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();

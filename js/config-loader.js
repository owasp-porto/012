/* ============================================================
   Config loader (engine — do not put per-event settings here).

   Responsibilities:
     1. Take the deck config from window.AllStaffConfig (set by config.js).
        If it's absent, fall back to safe defaults so the deck still runs.
     2. Apply URL-parameter overrides (?fragments=, ?audio=, ?music=, ?sfx=,
        ?volume=).
     3. Set the <html> classes that gate first-paint CSS (no-fragments / no-audio).
     4. Re-publish the merged result on window.AllStaffConfig for the other
        scripts (audio.js, progress.js, index.html's Reveal.initialize).

   Edit settings in config.js (it carries the documented options inline).
   ============================================================ */
(function () {
  // Safe fallbacks used when config.js is missing or only partially filled.
  // Empty music/sfx mean "silent but not broken".
  const FALLBACK = {
    fragmentsEnabled: false,
    progressBarMode: 'slide',
    audioEnabled: true,
    audioMusic: true,
    audioSfx: true,
    audioVolume: 0.18,
    music: [],
    sfx: {}
  };

  const user = window.AllStaffConfig || {};
  const cfg = Object.assign({}, FALLBACK, user);

  // Deep-merge sfx so a partial sfx object still gets the fallback keys.
  cfg.sfx = Object.assign({}, FALLBACK.sfx, user.sfx || {});

  // URL-param overrides (win over config.js)
  try {
    const q = new URLSearchParams(window.location.search);
    const bool = (k) => q.get(k) === '1' || q.get(k) === 'true';
    if (q.has('fragments')) cfg.fragmentsEnabled = bool('fragments');
    if (q.has('audio'))     cfg.audioEnabled    = bool('audio');
    if (q.has('music'))     cfg.audioMusic      = bool('music');
    if (q.has('sfx'))       cfg.audioSfx        = bool('sfx');
    if (q.has('volume')) {
      const v = parseFloat(q.get('volume'));
      if (!isNaN(v) && v >= 0 && v <= 1) cfg.audioVolume = v;
    }
  } catch (_) { /* ignore */ }

  window.AllStaffConfig = cfg;

  // First-paint gating classes
  const root = document.documentElement;
  root.classList.toggle('no-fragments', !cfg.fragmentsEnabled);
  if (!cfg.audioEnabled) root.classList.add('no-audio');
})();

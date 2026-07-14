/* ============================================================
   Jscrambler All-Staff — audio engine

   Two layers:

   1. MUSIC — recorded MP3 tracks in slides/assets/audio/ assigned to slide
      ranges via the `music` array in config.js. The player fades a track
      in when you enter its range, fades it out when you leave (or when a
      different track takes over). Tracks can loop. The same track may be
      assigned to multiple ranges; the player restarts it on re-entry.

   2. SFX — short sound effects, still synthesised via Web Audio API for
      portability. Cover chime / detour bed / closing chord used to live
      here too but are now recorded files; see music array in config.js.

   Sound map (slides 1-16 in human numbering):

     slide  1  · Cover                        · spaceambient.mp3 (music)
     slide  2-7 / 12-13 / 15-16  · all changes· soft slide-change tick (SFX)
     slide  8  · Detour entry                 · sub-bass whoosh IN (SFX, disabled by default)
                                              · tranquility.mp3 fades in (music)
                                              · magnetic hum (SFX, +1.5s)
     slide  9-11 · within detour              · pad swell (SFX), bed continues
     slide 12  · Detour exit (WPI vision)     · whoosh OUT (SFX, disabled by default), bed fades out
     slide 14-15 · Closing reveal             · chariotsoffire.mp3 (music)
     slide 15  · Questions / LLM meme         · robot boop (SFX)
     slide 16  · Hand-off to Joel             · time-travel rising sweep (SFX)

   Volume is master-capped at 0.5 in code regardless of config (speaker safety).

   Keyboard:  M  → mute / unmute
   Visual  :  🔊 / 🔇 button bottom-left
   ============================================================ */
(function () {
  const cfg = window.AllStaffConfig || {};
  if (!cfg.audioEnabled) return;

  const MAX_VOLUME = 0.5;         // hard speaker-safety cap
  const STEP = 0.05;              // bump size per + / - press
  let currentVolume = Math.min(MAX_VOLUME, Number.isFinite(cfg.audioVolume) ? cfg.audioVolume : 0.18);

  let ctx = null;
  let masterGain = null;
  let muted = false;
  let lastSlide = -1;

  /* ---------- AudioContext lifecycle ---------- */
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = currentVolume;
    masterGain.connect(ctx.destination);
    return ctx;
  }
  function unlock() {
    ensureCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(refreshWaitingUI).catch(() => {});
    } else {
      refreshWaitingUI();
    }
    // Once we have a context after a gesture, try to play any music that
    // should already be running for the current slide.
    if (lastSlide >= 0) updateMusic(lastSlide);
  }
  // Visual "audio waiting for gesture" state — turns the mute indicator
  // into a pulsing play badge until the user clicks/types to unlock.
  function refreshWaitingUI() {
    const btn = document.getElementById('audio-mute-indicator');
    if (!btn) return;
    const waiting = !ctx || ctx.state !== 'running';
    btn.classList.toggle('waiting', waiting);
    if (waiting) {
      btn.title = 'Click to start audio';
      btn.querySelector('.ami-icon').textContent = '▶︎';
    } else {
      btn.title = 'Audio · M mute · + / − volume';
      updateMuteUI();
    }
  }
  ['keydown', 'click', 'touchstart', 'pointerdown'].forEach((ev) => {
    document.addEventListener(ev, unlock, { capture: true });
  });

  /* ---------- Low-level synth helpers (SFX layer) ---------- */
  function osc(freq, type, start, dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    o.start(start);
    o.stop(start + dur + 0.05);
    return o;
  }
  function noise(dur) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function gain(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function biquad(type, freq, Q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (Q !== undefined) f.Q.value = Q;
    return f;
  }

  /* ========================================================
     MUSIC PLAYER — plays MP3 files assigned via config
     ======================================================== */
  function parseRanges(spec) {
    if (!spec) return [];
    return String(spec).split(',').map((part) => {
      const seg = part.trim();
      const m = seg.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) return null;
      const from = parseInt(m[1], 10);
      const to = m[2] !== undefined ? parseInt(m[2], 10) : from;
      return { from, to };
    }).filter(Boolean);
  }
  function entryMatchesSlide(entry, oneBasedIdx) {
    return entry._ranges.some((r) => oneBasedIdx >= r.from && oneBasedIdx <= r.to);
  }

  // Convert dB offset → linear amplitude multiplier, clamped for safety.
  // 0 dB = 1.0 (no change), -6 dB ≈ 0.5, +6 dB ≈ 2.0.
  function dbToLinear(db) {
    if (!Number.isFinite(db)) return 1.0;
    const clamped = Math.max(-40, Math.min(12, db));
    return Math.pow(10, clamped / 20);
  }

  const musicEntries = (Array.isArray(cfg.music) ? cfg.music : []).map((e, i) => ({
    track: e.track,
    loop: !!e.loop,
    fadeIn: Number.isFinite(e.fadeIn) ? e.fadeIn : 0.2,
    fadeOut: Number.isFinite(e.fadeOut) ? e.fadeOut : 2.0,
    // Per-track volume calibration in dB, relative to master (default 0).
    volumeDb: Number.isFinite(e.volume) ? e.volume : 0,
    _volMul: dbToLinear(Number.isFinite(e.volume) ? e.volume : 0),
    _ranges: parseRanges(e.slides),
    _index: i,
    // Lazy-instantiated:
    _audio: null,
    _gain: null,
    _src: null
  }));

  function loadEntry(entry) {
    if (entry._audio) return entry;
    if (!ensureCtx()) return null;
    const audio = new Audio('assets/audio/' + entry.track);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.loop = entry.loop;
    let src;
    try {
      src = ctx.createMediaElementSource(audio);
    } catch (err) {
      console.warn('[audio] createMediaElementSource failed for', entry.track, err);
      return null;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(masterGain);
    entry._audio = audio;
    entry._gain  = g;
    entry._src   = src;
    return entry;
  }

  let currentEntry = null;
  let pendingStopTimer = null;

  function fadeIn(entry) {
    if (!loadEntry(entry)) return;
    // If a fadeOut from a previous visit to this slide is still scheduled to
    // pause the audio, cancel it — otherwise it would silence the playback
    // we're about to start.
    if (pendingStopTimer) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }
    const t = ctx.currentTime;
    entry._gain.gain.cancelScheduledValues(t);
    entry._gain.gain.setValueAtTime(0, t);
    // Ramp to the per-track calibration target (1.0 if `volume` is 0 dB).
    entry._gain.gain.linearRampToValueAtTime(entry._volMul, t + entry.fadeIn);
    try { entry._audio.currentTime = 0; } catch (_) {}
    const p = entry._audio.play();
    if (p && p.catch) {
      p.catch((err) => {
        // Autoplay blocked — will retry on next user gesture (unlock).
        if (err && err.name !== 'NotAllowedError') {
          console.warn('[audio] play() failed for', entry.track, err);
        }
      });
    }
  }
  function fadeOut(entry) {
    if (!entry || !entry._gain || !ctx) return;
    const t = ctx.currentTime;
    entry._gain.gain.cancelScheduledValues(t);
    entry._gain.gain.setValueAtTime(entry._gain.gain.value, t);
    entry._gain.gain.linearRampToValueAtTime(0, t + entry.fadeOut);
    if (pendingStopTimer) clearTimeout(pendingStopTimer);
    pendingStopTimer = setTimeout(() => {
      try { entry._audio.pause(); entry._audio.currentTime = 0; } catch (_) {}
      pendingStopTimer = null;
    }, entry.fadeOut * 1000 + 80);
  }

  function updateMusic(idx) {
    if (!cfg.audioMusic) return;
    if (!musicEntries.length) return;
    if (!ensureCtx()) return;

    const oneBased = idx + 1;
    const match = musicEntries.find((e) => entryMatchesSlide(e, oneBased));

    if (match === currentEntry) return;  // same (or both null)

    if (currentEntry) fadeOut(currentEntry);
    currentEntry = match || null;
    if (currentEntry) fadeIn(currentEntry);
  }

  /* ========================================================
     SFX — synthesised short sounds, routed through per-SFX gain nodes
     that apply the dB calibration from cfg.sfx[name].volume.

     Each playFoo() takes an optional `dest` AudioNode (defaults to the
     master gain). The trigger logic lives in onSlideChanged below and is
     driven entirely by cfg.sfx.
     ======================================================== */

  const sfxConfig = cfg.sfx || {};
  const _sfxGainNodes = {};
  function sfxDest(name) {
    if (!ensureCtx()) return null;
    if (_sfxGainNodes[name]) return _sfxGainNodes[name];
    const entry = sfxConfig[name] || {};
    const g = ctx.createGain();
    g.gain.value = dbToLinear(Number.isFinite(entry.volume) ? entry.volume : 0);
    g.connect(masterGain);
    _sfxGainNodes[name] = g;
    return g;
  }

  function playSpaceWhoosh(direction, dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    const dur = 1.6;
    const goingIn = direction === 'in';

    const sub = osc(goingIn ? 40 : 120, 'sawtooth', t, dur);
    sub.frequency.exponentialRampToValueAtTime(goingIn ? 140 : 50, t + dur);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.32, t + 0.15);
    sg.gain.linearRampToValueAtTime(0.20, t + dur - 0.4);
    sg.gain.linearRampToValueAtTime(0.0001, t + dur);
    sub.connect(sg).connect(dest);

    const n = noise(dur);
    n.start(t);
    n.stop(t + dur + 0.05);
    const bp = biquad('bandpass', goingIn ? 300 : 2200, 1.8);
    bp.frequency.setValueAtTime(goingIn ? 300 : 2200, t);
    bp.frequency.exponentialRampToValueAtTime(goingIn ? 2400 : 400, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.22, t + 0.08);
    ng.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(ng).connect(dest);
  }

  function playMagneticHum(dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    const dur = 1.8;
    const o = osc(110, 'sawtooth', t, dur);
    const filt = biquad('lowpass', 700, 4);
    const trem = osc(8, 'sine', t, dur);
    const tremG = gain(0.22);
    const g = ctx.createGain();
    g.gain.value = 0.22;
    trem.connect(tremG).connect(g.gain);
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, t);
    eg.gain.linearRampToValueAtTime(0.55, t + 0.25);
    eg.gain.setValueAtTime(0.55, t + dur - 0.4);
    eg.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(filt).connect(g).connect(eg).connect(dest);
  }

  function playSwell(dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    const dur = 0.8;
    const o = osc(220, 'sine', t, dur);
    o.frequency.exponentialRampToValueAtTime(440, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
  }

  function playTimeTravel(dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    const dur = 1.4;
    [220, 277.18, 329.63, 415.30, 523.25, 659.25, 880].forEach((f, i) => {
      const start = t + i * 0.08;
      const o = osc(f, 'sawtooth', start, 0.35);
      const filt = biquad('lowpass', 800);
      filt.frequency.setValueAtTime(800, start);
      filt.frequency.exponentialRampToValueAtTime(4000, start + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.17, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      o.connect(filt).connect(g).connect(dest);
    });
    const n = noise(dur);
    n.start(t);
    n.stop(t + dur + 0.05);
    const bp = biquad('bandpass', 300, 1);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.18, t + 0.2);
    ng.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(ng).connect(dest);
  }

  function playRobotBoop(dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    [{ f: 600, d: 0 }, { f: 900, d: 0.12 }].forEach(({ f, d }) => {
      const o = osc(f, 'square', t + d, 0.18);
      const filt = biquad('lowpass', 2200);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.14, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.14);
      o.connect(filt).connect(g).connect(dest);
    });
  }

  function playSlideTick(dest) {
    if (!ensureCtx()) return;
    dest = dest || masterGain;
    const t = ctx.currentTime;
    const n = noise(0.08);
    n.start(t);
    n.stop(t + 0.1);
    const hp = biquad('highpass', 3500);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(g).connect(dest);
  }

  /* ---------- SFX dispatcher (config-driven) ---------- */
  const SFX_PLAYERS = {
    tick:        (dest) => playSlideTick(dest),
    whooshIn:    (dest) => playSpaceWhoosh('in', dest),
    whooshOut:   (dest) => playSpaceWhoosh('out', dest),
    magneticHum: (dest) => playMagneticHum(dest),
    swell:       (dest) => playSwell(dest),
    robotBoop:   (dest) => playRobotBoop(dest),
    timeTravel:  (dest) => playTimeTravel(dest)
  };

  function playSfx(name) {
    if (!cfg.audioSfx) return;
    const entry = sfxConfig[name];
    if (!entry || entry.enabled === false) return;
    const fn = SFX_PLAYERS[name];
    if (!fn) return;
    fn(sfxDest(name));
  }

  // Check trigger conditions for an SFX entry on a slide-change event.
  // Both slide indices are 1-based here. `prevOne === 0` means "no previous"
  // (first event of the session).
  function sfxShouldFire(entry, prevOne, curOne) {
    if (!entry || entry.enabled === false) return false;
    if (entry.every) return prevOne !== 0;
    if (!entry.slides) return false;
    if (!inRange(entry.slides, curOne)) return false;
    if (entry.from && !inRange(entry.from, prevOne)) return false;
    if (entry.notFrom && inRange(entry.notFrom, prevOne)) return false;
    return true;
  }
  function inRange(spec, oneBased) {
    if (!spec) return false;
    return parseRanges(spec).some((r) => oneBased >= r.from && oneBased <= r.to);
  }

  /* ---------- Slide event router (config-driven SFX dispatch) ----------
     Every SFX trigger is declared in cfg.sfx — see config.js. This
     function just iterates over the config and fires the matching SFX. */
  function onSlideChanged(event) {
    const idx = event && typeof event.indexh === 'number'
      ? event.indexh
      : (window.Reveal && window.Reveal.getIndices ? window.Reveal.getIndices().h : 0);
    const prev = lastSlide;
    if (prev === idx) return;
    lastSlide = idx;

    // Music handles entry/exit/cross-fade by itself
    updateMusic(idx);

    if (!cfg.audioSfx) return;

    const curOne  = idx + 1;
    const prevOne = prev + 1; // -1 (no prev) → 0 (sentinel that no range matches)

    for (const name of Object.keys(sfxConfig)) {
      const entry = sfxConfig[name];
      if (!sfxShouldFire(entry, prevOne, curOne)) continue;
      const delay = Number.isFinite(entry.delay) ? entry.delay : 0;
      if (delay > 0) setTimeout(() => playSfx(name), delay);
      else playSfx(name);
    }
  }

  /* ---------- Volume + mute ---------- */
  function applyVolume(rampSec = 0.15) {
    if (!ensureCtx()) return;
    const target = muted ? 0 : currentVolume;
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(target, t + rampSec);
  }
  function setMuted(state) {
    muted = state;
    applyVolume(0.2);
    updateMuteUI();
  }
  function bumpVolume(delta) {
    // Pressing +/- always unmutes — it would be weird to silently change the
    // stored volume while nothing is audible.
    if (muted) muted = false;
    currentVolume = Math.max(0, Math.min(MAX_VOLUME, currentVolume + delta));
    applyVolume(0.08);
    showVolumeToast();
  }
  let _toastTimer = null;
  function showVolumeToast() {
    const btn = document.getElementById('audio-mute-indicator');
    if (!btn) return;
    const pct = Math.round((currentVolume / MAX_VOLUME) * 100);
    const icon = btn.querySelector('.ami-icon');
    icon.textContent = pct + '%';
    btn.style.background = 'rgba(0,2,209,0.16)';
    btn.style.opacity = '1';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      _toastTimer = null;
      updateMuteUI(); // restore icon + background
      btn.style.opacity = '0.6';
    }, 1200);
  }
  function createMuteUI() {
    if (document.getElementById('audio-mute-indicator')) return;
    // Inject the pulse keyframes (scoped to this UI element)
    if (!document.getElementById('audio-mute-style')) {
      const style = document.createElement('style');
      style.id = 'audio-mute-style';
      style.textContent =
        '@keyframes ami-pulse {' +
          '0%,100% { box-shadow: 0 2px 8px rgba(0,2,209,0.18); transform: scale(1); }' +
          '50%    { box-shadow: 0 2px 18px rgba(224,255,0,0.85); transform: scale(1.08); }' +
        '}' +
        '#audio-mute-indicator.waiting {' +
          'animation: ami-pulse 1.6s ease-in-out infinite;' +
          'background: var(--chartreuse) !important;' +
          'opacity: 1 !important;' +
          'color: var(--defense-blue);' +
        '}';
      document.head.appendChild(style);
    }

    const btn = document.createElement('div');
    btn.id = 'audio-mute-indicator';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Audio — M mute · +/- volume');
    btn.title = 'Audio · M mute · + / − volume';
    btn.innerHTML = '<span class="ami-icon">🔊</span>';
    btn.style.cssText = [
      'position:fixed', 'left:14px', 'bottom:50px', 'z-index:1000',
      'background:rgba(255,255,255,0.88)',
      'border:1px solid rgba(0,2,209,0.18)',
      'border-radius:999px', 'padding:4px 12px', 'cursor:pointer',
      'font-size:16px', 'line-height:1',
      'font-family:system-ui,-apple-system,sans-serif',
      'box-shadow:0 2px 8px rgba(0,2,209,0.12)',
      'transition:opacity 250ms ease, background 250ms ease',
      'opacity:0.6', 'user-select:none', 'pointer-events:auto'
    ].join(';');
    btn.addEventListener('click', (e) => {
      // Don't toggle mute while we're still waiting for unlock — the click
      // IS the unlock gesture (handled by the document listener in capture).
      if (btn.classList.contains('waiting')) return;
      e.stopPropagation();
      setMuted(!muted);
    });
    btn.addEventListener('mouseenter', () => {
      if (!btn.classList.contains('waiting')) btn.style.opacity = '1';
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.classList.contains('waiting')) btn.style.opacity = '0.6';
    });
    document.body.appendChild(btn);
  }
  function updateMuteUI() {
    const btn = document.getElementById('audio-mute-indicator');
    if (!btn) return;
    btn.querySelector('.ami-icon').textContent = muted ? '🔇' : '🔊';
    btn.style.background = muted ? 'rgba(242,0,255,0.18)' : 'rgba(255,255,255,0.88)';
  }
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'm' || e.key === 'M') {
      setMuted(!muted);
      e.preventDefault();
      return;
    }
    // Volume: + / = bump up; - / _ bump down. Repeats on key-hold.
    if (e.key === '+' || e.key === '=') {
      bumpVolume(+STEP);
      e.preventDefault();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      bumpVolume(-STEP);
      e.preventDefault();
      return;
    }
  });

  /* ---------- Boot ---------- */
  function boot() {
    createMuteUI();
    // No AudioContext yet → button starts in "waiting for gesture" state.
    refreshWaitingUI();
    function hook() {
      if (window.Reveal && typeof window.Reveal.on === 'function') {
        window.Reveal.on('slidechanged', onSlideChanged);
        const idxNow = (window.Reveal.getIndices && window.Reveal.getIndices().h) || 0;
        lastSlide = idxNow;
        // First update fires after first user gesture (unlock) — until then,
        // the AudioContext is suspended and audio.play() would fail.
      } else {
        setTimeout(hook, 60);
      }
    }
    hook();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Small public surface so other modules (e.g. js/help-dialog.js) can
  // toggle mute / bump volume without redefining keyboard handlers.
  window.AllStaffAudio = {
    setMuted:    (state) => setMuted(state),
    toggleMute:  () => setMuted(!muted),
    isMuted:     () => muted,
    bumpVolume:  (delta) => bumpVolume(delta),
    getVolume:   () => currentVolume
  };
})();

/* ============================================================
   Jscrambler All-Staff May 2026 — Custom animations
   - Count-up for $ TAM numbers
   - Replays on slide entry; also triggers when a fragment carrying a
     count-up becomes visible (so the animation doesn't fire while the
     element is still hidden inside an unrevealed fragment).
   ============================================================ */

(function () {
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function animateCountUp(el) {
    if (el.dataset.animated === '1') return;
    el.dataset.animated = '1';

    const from   = parseFloat(el.dataset.from || '0');
    const to     = parseFloat(el.dataset.to || '0');
    const dur    = parseInt(el.dataset.duration || '1200', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimals || '0', 10);

    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const v = from + (to - from) * easeOut(t);
      el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function resetCountUp(el) {
    el.dataset.animated = '';
    const from   = parseFloat(el.dataset.from || '0');
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    el.textContent = `${prefix}${from.toFixed(decimals)}${suffix}`;
  }

  // Is the element inside an unrevealed fragment? (i.e. has an ancestor
  // `.fragment` that does not also have `.visible`)
  function isInsideHiddenFragment(el) {
    let node = el.parentElement;
    while (node && !node.classList?.contains('reveal')) {
      if (node.classList?.contains('fragment') && !node.classList.contains('visible')) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function onSlideChanged(event) {
    const slide = event && event.currentSlide ? event.currentSlide :
                  (window.Reveal && window.Reveal.getCurrentSlide && window.Reveal.getCurrentSlide());
    if (!slide) return;

    // Reset everywhere first so revisiting a slide replays the animation
    document.querySelectorAll('.reveal .slides .count-up').forEach(resetCountUp);

    // Animate count-ups visible on the slide (skip those hidden by a fragment;
    // those will animate from `fragmentshown` below)
    Array.from(slide.querySelectorAll('.count-up'))
      .filter(el => !isInsideHiddenFragment(el))
      .forEach((el, i) => {
        setTimeout(() => animateCountUp(el), 200 + i * 120);
      });
  }

  function onFragmentShown(event) {
    if (!event || !event.fragment) return;
    const root = event.fragment;
    const targets = root.classList.contains('count-up')
      ? [root]
      : root.querySelectorAll('.count-up');
    targets.forEach((el) => animateCountUp(el));
  }

  function onFragmentHidden(event) {
    if (!event || !event.fragment) return;
    const root = event.fragment;
    const targets = root.classList.contains('count-up')
      ? [root]
      : root.querySelectorAll('.count-up');
    targets.forEach(resetCountUp);
  }

  // Hook Reveal events once Reveal is ready
  document.addEventListener('DOMContentLoaded', () => {
    function tryHook() {
      if (window.Reveal && typeof window.Reveal.on === 'function') {
        window.Reveal.on('slidechanged', onSlideChanged);
        window.Reveal.on('ready', onSlideChanged);
        window.Reveal.on('fragmentshown', onFragmentShown);
        window.Reveal.on('fragmenthidden', onFragmentHidden);
      } else {
        setTimeout(tryHook, 60);
      }
    }
    tryHook();
  });
})();

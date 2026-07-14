/* ============================================================
   Space-scene hover repulsion (slide 8 of the deck)

   Elements marked `.repel` inside `.space-scene` are nudged away from
   the mouse cursor when it gets close to them, then gracefully drift
   back to their natural position when the cursor moves away.

   The effect is layered on top of any existing CSS transform on the
   element (e.g. the gravitational `pull-right` / `pull-left` animation
   keeps the poles near the AI orb) by writing into a CSS custom
   property `--repel-x` / `--repel-y` and consuming it via:
       transform: translate(var(--repel-x, 0), var(--repel-y, 0)) <existing>
   in the stylesheet. Where there is no existing transform on the
   element we just apply the repel translation directly.
   ============================================================ */
(function () {
  const REPEL_RADIUS = 320; // px in slide coordinates: how close before repel kicks in
  const REPEL_MAX    = 70;  // px max nudge

  function setup(section) {
    if (section.dataset.repelBound === '1') return;
    section.dataset.repelBound = '1';

    const targets = Array.from(section.querySelectorAll('.repel'));
    if (!targets.length) return;

    // Cache target centres lazily (recomputed on slide-resize via Reveal)
    let rects = [];
    function refresh() {
      rects = targets.map(el => {
        const r = el.getBoundingClientRect();
        return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
    }

    let raf = 0;
    function onMove(e) {
      const mx = e.clientX, my = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        rects.forEach(({ el, cx, cy }) => {
          const dx = cx - mx;
          const dy = cy - my;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d > REPEL_RADIUS) {
            el.style.removeProperty('--repel-x');
            el.style.removeProperty('--repel-y');
            return;
          }
          // Strength falls off linearly from REPEL_MAX (at d=0) to 0 (at d=REPEL_RADIUS).
          const strength = (1 - d / REPEL_RADIUS) * REPEL_MAX;
          const ux = dx / (d || 1);
          const uy = dy / (d || 1);
          el.style.setProperty('--repel-x', `${ux * strength}px`);
          el.style.setProperty('--repel-y', `${uy * strength}px`);
        });
      });
    }

    function onLeave() {
      targets.forEach(el => {
        el.style.removeProperty('--repel-x');
        el.style.removeProperty('--repel-y');
      });
    }

    refresh();
    section.addEventListener('mousemove', onMove);
    section.addEventListener('mouseleave', onLeave);
    // Recompute on resize (Reveal triggers this on slide change)
    window.addEventListener('resize', refresh);
  }

  function init() {
    document.querySelectorAll('.space-scene').forEach(setup);
  }

  /* ----- Convergence (.convergence) restart on slide entry -----
     CSS animations only fire on initial class application. To replay the
     gravitational-pull animation each time we navigate to the convergence
     slide, the `.converging` class is removed → reflowed → re-added. */
  function retriggerConvergence(slide) {
    if (!slide) return;
    const conv = slide.querySelector('.convergence');
    if (!conv) return;
    document.querySelectorAll('.convergence.converging').forEach(c => c.classList.remove('converging'));
    // Force layout flush so the next class re-add restarts the animation.
    void conv.offsetWidth;
    conv.classList.add('converging');
  }

  function onSlideChanged(event) {
    const slide = event && event.currentSlide;
    retriggerConvergence(slide);
  }

  function hookReveal() {
    if (window.Reveal && typeof window.Reveal.on === 'function') {
      window.Reveal.on('slidechanged', onSlideChanged);
      window.Reveal.on('ready', () => {
        retriggerConvergence(window.Reveal.getCurrentSlide && window.Reveal.getCurrentSlide());
      });
    } else {
      setTimeout(hookReveal, 60);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); hookReveal(); });
  } else {
    init();
    hookReveal();
  }
})();

/* ============================================================
   Bottom progress bar.

   Two modes (set via window.AllStaffConfig.progressBarMode):

   • 'section' — segments are clickable; click jumps to the FIRST slide of
                 that section. Section labels are always visible above the
                 colored bar.

   • 'slide'   (default) — same visual layout, but on hover the bar
                 highlights the specific slide under the cursor and shows
                 a tooltip with the slide title (from notes.json). Click
                 jumps to that exact slide. Move the cursor out and the
                 marker + tooltip fade.

   Per-slide titles are picked up from `window.AllStaffSlideTitles`, set by
   `js/notes-loader.js` after fetching `notes.json`.
   ============================================================ */
(function () {
  const cfg = window.AllStaffConfig || {};
  const mode = cfg.progressBarMode === 'section' ? 'section' : 'slide';

  function getTotalSlides() {
    if (window.Reveal && typeof window.Reveal.getTotalSlides === 'function') {
      return window.Reveal.getTotalSlides();
    }
    return document.querySelectorAll('.reveal .slides > section').length || 1;
  }
  function getSlideTitles() {
    return Array.isArray(window.AllStaffSlideTitles) ? window.AllStaffSlideTitles : [];
  }

  /* ---------- "where are we" highlighter (works in both modes) ---------- */
  function update() {
    const slideIdx = (window.Reveal && window.Reveal.getIndices)
      ? window.Reveal.getIndices().h
      : 0;
    const total = getTotalSlides();
    const overallPct = total > 1
      ? Math.round((slideIdx / (total - 1)) * 100)
      : 0;

    document.querySelectorAll('.progress-bar').forEach((bar) => {
      bar.querySelectorAll('.seg').forEach((seg) => {
        const from = parseInt(seg.dataset.from || '0', 10);
        const to   = parseInt(seg.dataset.to   || '0', 10);
        seg.classList.remove('past', 'active');
        seg.removeAttribute('data-percent');

        if (slideIdx >= to) {
          seg.classList.add('past');
        } else if (slideIdx >= from && slideIdx < to) {
          seg.classList.add('active');
          const slidesInSec = to - from;
          const within = slideIdx - from;
          const pct = slidesInSec > 0 ? (slideIdx === 0 ? 0 : ((within + 0.5) / slidesInSec) * 100) : 0;  /* half-cell offset keeps each section's first flag inside its segment; only the deck's very first flag sits at the far-left edge */
          seg.style.setProperty('--tick-pos', `${pct}%`);
          seg.setAttribute('data-percent', String(overallPct));
        }
      });
    });
  }

  /* ---------- 'section' mode: click jumps to the first slide of the section ---------- */
  function wireSectionClicks() {
    document.querySelectorAll('.progress-bar .seg').forEach((seg) => {
      if (seg.dataset.clickBoundSec === '1') return;
      seg.dataset.clickBoundSec = '1';
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        const from = parseInt(seg.dataset.from || '0', 10);
        if (window.Reveal && typeof window.Reveal.slide === 'function') {
          window.Reveal.slide(from);
        }
      });
    });
  }

  /* ---------- 'slide' mode: hover marker + tooltip + click-any-slide ---------- */
  function ensureSlideOverlay(bar) {
    if (bar.querySelector('.slide-hover-marker')) return;
    const marker  = document.createElement('div');
    marker.className = 'slide-hover-marker';
    const tooltip = document.createElement('div');
    tooltip.className = 'slide-hover-tooltip';
    bar.appendChild(marker);
    bar.appendChild(tooltip);
  }

  function indexFromMouseX(bar, mouseX, total) {
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, mouseX - rect.left));
    const pct = x / rect.width;
    return Math.max(0, Math.min(total - 1, Math.floor(pct * total)));
  }

  function wireSlideHover() {
    document.querySelectorAll('.progress-bar').forEach((bar) => {
      if (bar.dataset.slideHoverBound === '1') return;
      bar.dataset.slideHoverBound = '1';
      ensureSlideOverlay(bar);
      const marker  = bar.querySelector('.slide-hover-marker');
      const tooltip = bar.querySelector('.slide-hover-tooltip');

      bar.addEventListener('mousemove', (e) => {
        const total = getTotalSlides();
        if (total <= 1) return;
        const idx = indexFromMouseX(bar, e.clientX, total);

        const slidePct = 100 / total;
        const leftPct = idx * slidePct;

        marker.style.left  = `${leftPct}%`;
        marker.style.width = `${slidePct}%`;
        marker.classList.add('visible');

        const titles = getSlideTitles();
        const title  = titles[idx] || `Slide ${idx + 1}`;
        tooltip.textContent = `${idx + 1} · ${title}`;
        // Centre tooltip over the slide segment; clamp to bar width
        const rect = bar.getBoundingClientRect();
        const centerPx = (leftPct + slidePct / 2) / 100 * rect.width;
        tooltip.style.left = `${centerPx}px`;
        tooltip.classList.add('visible');
      });

      bar.addEventListener('mouseleave', () => {
        marker.classList.remove('visible');
        tooltip.classList.remove('visible');
      });

      // Click anywhere on the bar in slide mode → jump to that slide
      bar.addEventListener('click', (e) => {
        // Skip if click was on a segment label / segment bar that already
        // has its own section-mode handler — but in slide mode that handler
        // is not wired, so we always own the click here.
        const total = getTotalSlides();
        if (total <= 1) return;
        const idx = indexFromMouseX(bar, e.clientX, total);
        if (window.Reveal && typeof window.Reveal.slide === 'function') {
          window.Reveal.slide(idx);
        }
      });
    });
  }

  function wireInteractions() {
    if (mode === 'section') wireSectionClicks();
    else                    wireSlideHover();
  }

  /* ---------- boot ---------- */
  function attach() {
    if (!window.Reveal || typeof window.Reveal.on !== 'function') {
      return setTimeout(attach, 30);
    }
    window.Reveal.on('slidechanged', update);
    window.Reveal.on('ready', () => { update(); wireInteractions(); });
    if (window.Reveal.isReady && window.Reveal.isReady()) {
      update();
      wireInteractions();
    }
  }

  attach();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { update(); wireInteractions(); });
  } else {
    setTimeout(() => { update(); wireInteractions(); }, 0);
  }
})();

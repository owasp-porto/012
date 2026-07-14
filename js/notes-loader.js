/* ============================================================
   Speaker-notes loader

   Reads `notes.json` and injects an `<aside class="notes">` element into
   each slide at the matching index, so the Reveal Notes plugin (press S)
   keeps working as if the notes were in the HTML.

   Editing the notes:
     - Open notes.json
     - Each entry is { index, title, notes }
     - `title` is for readability when editing — the loader ignores it
     - `index` is the 0-based slide position
     - `notes` is the text to show in the speaker-notes window

   Failure mode: if notes.json is missing or invalid, the deck still works,
   just without speaker notes — a warning is logged to the console.
   ============================================================ */
(function () {
  function inject(data) {
    if (!data || !Array.isArray(data.slides)) return;
    const sections = document.querySelectorAll('.reveal .slides > section');
    data.slides.forEach((entry) => {
      if (typeof entry.index !== 'number') return;
      const sec = sections[entry.index];
      if (!sec) return;
      if (sec.querySelector('aside.notes')) return; // already there (e.g. fallback)
      const aside = document.createElement('aside');
      aside.className = 'notes';
      // Use textContent for safety; notes are plain text by convention.
      aside.textContent = entry.notes || '';
      sec.appendChild(aside);
    });

    // Publish slide metadata for other scripts (e.g. progress.js needs the
    // per-slide titles for the hover tooltip). One window-level array keyed
    // by index → title string.
    window.AllStaffSlideTitles = data.slides.map((s) => s.title || `Slide ${s.index + 1}`);
    window.dispatchEvent(new CustomEvent('slides-data-ready', { detail: data }));
  }

  function load() {
    fetch('notes.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('notes.json HTTP ' + r.status);
        return r.json();
      })
      .then(inject)
      .catch((err) => {
        // Graceful: speaker notes simply won't be available, deck unaffected
        // eslint-disable-next-line no-console
        console.warn('[notes-loader] failed to load notes.json:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();

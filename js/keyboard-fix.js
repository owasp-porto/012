/* ============================================================
   Keyboard fix — let modifier-key combos reach the browser.

   Reveal.js v5 has a quirky modifier-key check in its keyboard module:
   when Alt (Option on macOS) is pressed, the check incorrectly returns
   `false` for "should bail", so Reveal handles the letter as a navigation
   key anyway. The visible symptom: pressing `Cmd+Option+J` (DevTools on
   macOS Chrome/Edge) advances the slide instead of opening DevTools.

   Fix: install a capture-phase keydown listener on `document` that calls
   `stopPropagation()` whenever Cmd / Ctrl / Alt is pressed. Reveal's
   listener runs in BUBBLE phase, so capture+stop means it never sees the
   event. Plain `Shift` is allowed through (Reveal uses Shift + arrows for
   first/last-slide jumps and that's a legit nav modifier).

   This file MUST be loaded BEFORE `Reveal.initialize(...)` runs, so my
   capture-phase listener is registered before Reveal's bubble-phase one.
   In practice any script tag before the inline init block works.
   ============================================================ */
(function () {
  document.addEventListener('keydown', (event) => {
    // Allow Cmd/Ctrl/Alt combos to fall through to the browser (DevTools,
    // tab nav, reload, etc.) without being hijacked by Reveal's letter-key
    // navigation. Shift alone is fine.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      event.stopPropagation();
    }
  }, true /* capture phase */);
})();

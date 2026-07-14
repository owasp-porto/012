/* ============================================================
   Deck configuration — THE FILE YOU EDIT.

   Plain data: it sets `window.AllStaffConfig` and nothing else. The merge /
   URL-override / boot logic lives in js/config-loader.js — don't touch that.
   (The global keeps the historical name `AllStaffConfig`; it's just an
   identifier shared by the engine and the deck, reused across both skills.)

   Load order (see index.html <head>):
       config.js            ← this file (sets window.AllStaffConfig)
       js/config-loader.js  ← merges it over safe fallbacks, applies URL params

   This file IS the deck's config and is committed with the deck (not git-ignored).

   ------------------------------------------------------------
   Options
   ------------------------------------------------------------
   fragmentsEnabled : false   content appears all at once. true → fragments
                              reveal progressively on each arrow press.
   progressBarMode  : 'slide' hover shows per-slide tooltip (title from
                              notes.json); click jumps to that slide.
                      'section' coarser; click jumps to first slide of section.
   audioEnabled     : true    master switch for all sound.
   audioMusic       : true    enable the `music` tracks (files must exist in
                              assets/audio/ — see that folder's README).
   audioSfx         : false   synthesised sound effects (off for meetups).
   audioVolume      : 0.18    master volume 0–1 (hard-capped at 0.5 in audio.js).

   OWASP meetup decks are usually presented silently — the music array is empty
   so nothing plays unless you add tracks.

   URL overrides (win over this file):
     ?fragments=1|0 · ?audio=0|1 · ?music=0|1 · ?sfx=0|1 · ?volume=0.25
   Live keys during the talk: M mute/unmute, + / − volume.
   ============================================================ */
window.AllStaffConfig = {
  fragmentsEnabled: false,
  progressBarMode: 'slide',          // 'slide' | 'section'
  audioEnabled: true,
  audioMusic: true,
  audioSfx: false,
  audioVolume: 0.18,

  // MUSIC — optional. Drop .mp3 into assets/audio/ and reference here.
  music: [
    // { track: 'intro.mp3', slides: '1', loop: false, fadeIn: 0.2, fadeOut: 2.0, volume: 0 }
  ],

  // SFX — synthesised, shipped with the engine. Off by default for meetups.
  sfx: {
    tick: { enabled: false, volume: 0, every: true }
  }
};

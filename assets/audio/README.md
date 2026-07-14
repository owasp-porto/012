# Music tracks go here — optional, NOT shipped with the skill

OWASP Porto meetup decks are normally presented **silently**, so this folder is
empty and `config.js` has an empty `music` array. The audio engine is inherited
from the deck machinery and stays out of the way unless you add tracks.

## How to add music (optional)

1. Drop an audio file here, e.g. `assets/audio/intro.mp3`
   (`.mp3`, `.m4a`, `.wav`, `.ogg` all play in modern browsers).
2. Reference it from `config.js` → `music` array (filename only):

   ```js
   music: [
     { track: 'intro.mp3', slides: '1', loop: false, fadeIn: 0.2, fadeOut: 2.0, volume: 0 }
   ]
   ```

3. Music files are committed with the deck by default. If a track is large or
   licensed, add just that file to the deck's `.gitignore`.

Synthesised sound effects (`tick`, etc.) also exist in `js/audio.js` but are
disabled by default for meetups (`audioSfx: false` in `config.js`).

# MovieByLucia

Eine Coverwand der eigenen Film- und Serienliste. Die Poster stehen ohne Abstand nebeneinander. Ein Klick öffnet einen Film, ein Doppelklick markiert ihn als gesehen. Oben schaltet **Bewertung** die eigene Note als Farbfläche über die Cover.

## Start

```bash
node server.mjs
```

Der Server liest `TMDB_ACCESS_TOKEN` und holt die Poster von TMDB. Ohne Schlüssel zeigt die Wand den Filmtitel auf einem dunklen Cover.

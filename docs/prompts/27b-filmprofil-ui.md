# Prompt 27b – Filmprofil: Zusammenfassung und Anzeige

Prompt 27a ist vollständig umgesetzt: `api/taste.js` (POST/DELETE, feste Fehlercodes), Schema mit `taste`, `taste_hidden`, `profile_taste(uid)`, `clear_taste()`, und in `cloud.js` die Methoden `createTaste(summary)`, `deleteTaste()`, `setTasteHidden(hidden)`, `tasteOf(userId)`.

Regeln: Bitte NICHT im Browser testen, nur Code ändern. In JS immer einfache Anführungszeichen. Layout von Top 10, Lieblingsschauspieler/-regie, Avatar und Netzwerk nicht verändern, ausser wo beschrieben. `api/taste.js` und `schema.sql` nicht ändern.

## A) Zusammenfassung im Browser (app.js, neue Funktion `tasteSummary()`)

Nur eigene bewertete Filme (`rating != null`, im Archiv, nicht ausgeblendet), mit den zusammengeführten Facetten (wie `fullOf` / `FILM_FACETS`). Keine Benutzernamen, keine Notizen, keine IDs. Feldnamen exakt so, weil der Server nur diese übernimmt:

- `rated_count`, `avg_rating`, `rating_spread` (Standardabweichung), `share_high` (Anteil ≥ 8), `share_low` (Anteil ≤ 4)
- `genres`: Top 8 nach Anzahl, je `{ name, count, avg }`
- `subgenres`, `themes`: je Top 10 `{ name, count, avg }`
- `tone`, `intensity`, `narrative` (soweit in den Facetten vorhanden): Verteilung als Objekt `{ wert: anzahl }`
- `decades`: Liste `{ name: '1990er', count, avg }`
- `top_films`: die Top 10 aus dem Profil, je `{ title, year, rating }`
- `low_films`: die 5 am schlechtesten bewerteten, je `{ title, year, rating }`
- `directors`, `actors`: je Top 5 wie in Lieblingsregie/-schauspieler, je `{ name, count, avg }`
- `outliers`: bis zu 5 Filme, deren Rating mindestens 2.5 Punkte vom eigenen Ø ihres Hauptgenres abweicht, je `{ title, genre, rating, genre_avg }`

Zahlen auf 1 Nachkommastelle runden. `JSON.stringify` des Ergebnisses muss unter 11 KB bleiben, sonst Listen von hinten kürzen.

## B) Anzeige im eigenen Profil

Platz: direkt unter Avatar und Name, über Top 10. Auf Desktop über beide Spalten.

Eigenes Filmprofil laden mit `Cloud.tasteOf(account.id)` (nicht aus `profile()`), `taste_hidden` kommt aus `profile()`.

Zustände:
- Weniger als 15 bewertete Filme: dezente graue Zeile «Ab 15 bewerteten Filmen kann dein Filmprofil erstellt werden (noch X).» Kein Knopf.
- Ab 15 und noch kein Profil: Textknopf «Filmprofil erstellen», darunter klein und grau: «Deine Bewertungen werden dafür an Google Gemini geschickt, ohne Namen und Notizen.»
- Während des Erstellens: Knopf deaktiviert, Text «Wird erstellt …», kein Doppelklick möglich.
- Wenn vorhanden:
  - `title` gross (wie Abschnittstitel, aber normale Schrift, keine Grossbuchstaben)
  - `taste` als Absatz, `character` als zweiter Absatz in `var(--dim)`
  - `tags` als 3 kleine, dezente Chips
  - darunter klein und grau: «Erstellt am <Datum> · aus <rated_count> Bewertungen»
  - eine Zeile mit kleinen Aktionen:
    - «Neu erstellen»: nur aktiv, wenn `created_at` älter als 20 Stunden ist, sonst grau mit «wieder ab <Datum/Uhrzeit>»
    - «Für Freunde ausblenden» / «Für Freunde einblenden» (`setTasteHidden`); wenn ausgeblendet, kleiner grauer Hinweis «nur für dich sichtbar»
    - Löschen: gleiches rotes X mit «sure?» wie bei der Wunschliste, ruft `deleteTaste()` auf
  - Wenn jetzt mindestens 10 Filme mehr bewertet sind als `rated_count`: Hinweis «Dein Geschmack hat sich verändert» neben «Neu erstellen».
- ALLE KI-Texte nur mit `textContent` einsetzen, niemals `innerHTML`.

## C) Fremde Profile

- Filmprofil mit `Cloud.tasteOf(<id der Person>)` laden (der Server gibt null zurück, wenn es ausgeblendet ist oder man das Profil nicht sehen darf).
- Wenn vorhanden: Titel, Texte und Tags gleich darstellen, ohne Aktionen, ohne Hinweise.
- Wenn null: nichts anzeigen (keine leere Fläche, kein Platzhalter).

## D) Fehlermeldungen

Kurz, unter dem Knopf, gleicher Stil wie die Avatar-Meldung. Der Fehler aus `cloud.js` hat ein Feld `code`:

- `not_configured` → «Die KI ist noch nicht eingerichtet.»
- `cooldown` → «Neu erstellen geht wieder ab <Uhrzeit aus retryAt>.»
- `quota` → «Für heute ist das KI-Kontingent aufgebraucht. Morgen wieder.»
- `too_few` → «Zu wenige Bewertungen (mindestens 15).»
- `too_large`, `bad_input` → «Die Daten sind zu gross oder ungültig.»
- `network` → «Keine Verbindung.»
- `timeout`, `ai_failed`, `bad_output`, `save_failed` und alles andere → «Hat nicht geklappt. Bitte später nochmals versuchen.»
- Jeweils den echten Fehler mit `console.error('[taste]', error)` loggen.

## E) Zusammenspiel

- Nach erfolgreichem Erstellen, Löschen oder Ein-/Ausblenden nur den Filmprofil-Block neu zeichnen, nicht das ganze Profil, und kein Neuladen der Seite.
- Nach dem Zurücksetzen des Archivs ist das Filmprofil weg (Server erledigt das); den Block danach mit leerem Zustand zeichnen.
- Ohne Login, offline oder ohne Cloud: Block nicht anzeigen.
- Das Profil darf nicht auf das Filmprofil warten: zuerst alles andere zeichnen, das Filmprofil nachladen und einsetzen, sobald es da ist. Wenn `tasteOf` fehlschlägt: Block einfach weglassen.

Am Ende kurz auflisten, was geändert wurde.

# MovieByLucia – Cluster-Netzwerk: Spezifikation

Gemeinsame Grundlage für alle Cursor-Prompts (Prompt 0 bis 9). Jeder Prompt beginnt mit `@docs/cluster-netzwerk.md`.

## A1. Ziel

Die Genre-Wand wird durch eine Netzwerk-Karte ersetzt. Ähnliche Filme liegen nah beieinander und bilden Subgenre-Cluster auf Genre-Inseln. Verwandte Genres liegen nebeneinander, fremde weit weg. Filme mit mehreren Genres liegen zwischen den Inseln (Brückenfilme). Die Ansichten Regie und Rating bleiben wie bisher bestehen. Die App ist gratis und kann an Freunde weitergegeben werden: alle nutzen dieselbe Web-Adresse, jede Person hat ihr eigenes Archiv im eigenen Browser.

## A2. Grundregel: Position und Linien sind getrennt

- **Position** entsteht nur aus dem Inhalt: Genre, Subgenre, Themen, Ton, Erzählstruktur, Intensität, Epoche, Ort, Jahr, Herkunft.
- **Regie, Hauptdarsteller, Franchise** ziehen nicht an der Position. Sie erscheinen als Linien, wenn ein Film ausgewählt ist, und zählen in der Liste «Verwandte Filme».

## A3. Datenmodell pro Film (Facetten)

Startliste: `films.js` (Basisdaten) + `data/facets.json` (Facetten) + `data/graph.json` (Positionen). Schlüssel = Film-ID.

```json
{
  "f006": {
    "imdbId": "tt1375666",
    "tmdbId": 27205,
    "tmdbType": "movie",
    "genres": ["Sci-Fi", "Thriller", "Action"],
    "subgenres": ["Mindfuck", "Heist"],
    "themes": ["Erinnerung & Wahrnehmung", "Trauer & Verlust", "Schuld"],
    "tone": ["spannungsgeladen", "cool"],
    "narrative": ["nicht-linear", "Ensemble"],
    "intensity": 3,
    "epoch": "Gegenwart",
    "place": "Grossstadt",
    "origin": ["US", "GB"],
    "cast": ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"],
    "director": "Christopher Nolan",
    "franchise": null,
    "format": "film",
    "tmdbRating": 8.4,
    "tmdbVotes": 37000,
    "source": "tmdb",
    "reviewed": false
  }
}
```

- `genres` 1–3 (erstes = Hauptgenre, bestimmt die Insel), `subgenres` 1–2, `themes` 2–4, `tone` 1–2, `narrative` 0–2, `intensity` 1–5.
- Alle Werte aus dem Vokabular (A4). Unbekannte Werte werden verworfen und in der Konsole gemeldet.
- `source`: `"tmdb"` oder `"manuell"`. `reviewed`: true, sobald im Panel geprüft.
- Die alten `tags` in `films.js` fliessen nicht mehr in die Ähnlichkeit ein, nur als Hinweis bei der Einordnung.

## A4. Vokabular (`data/vocabulary.json`)

**Genres (16):** Action, Abenteuer, Drama, Komödie, Krimi, Thriller, Mystery, Horror, Sci-Fi, Fantasy, Romantik, Kriegsfilm, Western, Historie, Biografie, Dokumentation

**genreAliases:** Krieg/Kriegsdrama/War → Kriegsfilm; Romanze/Romance → Romantik; Gangsterdrama/Crime → Krimi; Politthriller/Psychothriller → Thriller; Historisches Drama/Historien-Action/History → Historie; Sportdrama/Sport/Musik/Music/Familie/Family → Drama; Satire/Comedy → Komödie; Survival → Thriller; Science Fiction/Science-Fiction → Sci-Fi; Adventure → Abenteuer; Documentary → Dokumentation; Animation/Anime → Format (kein Genre). Englische TMDB-Genres ebenfalls abbilden.

**Format (nur Filter):** film, serie, miniserie, animation, anime

**Subgenres (Eltern-Genre):**
- Krimi: Heist, Gangster & Mafia, Whodunit, Cosy Crime, Neo-Noir, Ermittlung, Gerichtsdrama, True Crime
- Thriller: Psychothriller, Spionage, Politthriller & Verschwörung, Survival-Thriller, Belagerung & Home Invasion, Rachethriller, Entführung
- Mystery: Mindfuck, Übernatürliches Mysterium
- Horror: Übernatürlicher Horror, Okkult & Dämonen, Slasher, Body Horror, Kreaturenhorror, Zombie & Infektion, Vampire & Gothic, Folk Horror, Found Footage, Horrorkomödie
- Sci-Fi: Zeitreise, Weltraum, Space Opera, Dystopie, Postapokalypse, Cyberpunk & KI, Alien-Kontakt, Superhelden
- Fantasy: High Fantasy, Dark Fantasy, Mythologie & Märchen
- Action: Martial Arts, Militär-Action, Einzelkämpfer, Buddy-Action, Abenteuer-Action
- Drama: Charakterstudie, Familiendrama, Sozialdrama, Coming of Age, Sportfilm, Gefängnisfilm, Katastrophenfilm, Literaturverfilmung & Kostüm
- Komödie: Satire, Schwarze Komödie, Feel-Good
- Kriegsfilm: Zweiter Weltkrieg, Antikriegsfilm, Moderner Krieg
- Western: Klassischer Western, Neo-Western
- Biografie: Biopic, Aufstieg und Fall
- Romantik: Tragische Romanze, Gothic Romance
- Historie: Historienepos
- Dokumentation: True-Crime-Doku, Porträt, Survival-Doku

**Themen:** Rache, Schuld, Identität, Erinnerung & Wahrnehmung, Macht & Korruption, Gier & Exzess, Aufstieg & Fall, Freundschaft, Familie, Eltern & Kinder, Liebe & Obsession, Trauer & Verlust, Einsamkeit & Isolation, Überleben, Moral & Gewissen, Gesellschaftskritik & Klasse, Rassismus & Ausgrenzung, Glaube & Fanatismus, Wahnsinn, Technologie & KI, Zeit, Krieg & Trauma, Selbstjustiz, Täuschung & Hochstapelei, Überwachung & Verschwörung, Medien & Showbiz, Konzerne & Kapitalismus, Natur gegen Mensch, Ehrgeiz, Rivalität, Loyalität & Verrat, Erwachsenwerden, Alter & Vergänglichkeit, Sucht, Mythos & Legende, Rebellion & Widerstand, Geheimnisse, Wahrheit & Enthüllung, Heldentum, Was ist ein Mensch

**Ton:** düster, beklemmend, melancholisch, emotional, spannungsgeladen, leicht, schwarzhumorig, satirisch, episch, surreal, cool, warmherzig, abgedreht

**Erzählstruktur:** nicht-linear, Plot-Twist, unzuverlässiger Erzähler, Kammerspiel, Echtzeit & One-Shot, Episoden & Anthologie, Rückblenden, Ensemble, Found Footage & Mockumentary, Slow Burn

**Intensität (1–5):** 1 sanft, familientauglich · 2 leicht · 3 spannend mit Härten · 4 hart, verstörend · 5 extrem (Splatter, Gore)

**Epoche:** Antike, Mittelalter, 19. Jahrhundert, 1900–1945, 1946–1969, 1970–1989, Gegenwart, nahe Zukunft, ferne Zukunft, Fantasiewelt

**Ort:** Grossstadt, Kleinstadt & Provinz, Wildnis & Natur, isolierter Ort, Weltraum, Meer, Wüste, Schlachtfeld

## A5. Ähnlichkeit (`similarity.js` + `similarity.config.js`)

`similarity(a, b, mode)` mit `mode = 'layout'` oder `'links'` → `{ score: 0–1, reasons: [{ kind, label }] }`.

- Mengen (genres, subgenres, themes, tone, narrative, origin): gewichtetes Jaccard mit IDF, `idf(v) = log(1 + N / df(v))`, `sim = Σ idf(gemeinsam) / Σ idf(vereinigt)`. Hauptgenre zählt doppelt.
- Intensität `1 - |a - b| / 4`, Jahr `exp(-|a - b| / 8)`, Epoche und Ort 1 bei Gleichheit, sonst 0.
- Fehlende Facette bei einem der Filme: auslassen und übrige Gewichte neu normieren.

| Facette | layout | links |
|---|---|---|
| subgenres | 0.26 | 0.22 |
| genres | 0.18 | 0.12 |
| themes | 0.18 | 0.16 |
| tone | 0.11 | 0.08 |
| narrative | 0.07 | 0.06 |
| intensity | 0.07 | 0.04 |
| epoch + place | 0.06 | 0.04 |
| year | 0.04 | 0.03 |
| origin | 0.03 | 0.02 |
| gleiche Regie (nur links) | – | +0.30 |
| gleiches Franchise (nur links) | – | +0.40 |
| gemeinsamer Hauptdarsteller (nur links) | – | +0.12 je Person, max. 2 |

Bei `links` nach den Boni auf 1 kappen. Gründe als lesbare Texte: `Subgenre: Heist`, `Thema: Rache`, `Regie: Christopher Nolan`, `Mit: Leonardo DiCaprio`, `Erzählweise: nicht-linear`, `ähnliche Intensität`, `gleiche Epoche`.

## A6. Layout (`layout.js`, Einbettungskarte ohne Bibliothek)

Ein Modul für Node-Script und Browser (`globalThis.Layout`), damit Freunde ihre Karte im Browser neu ordnen können. Kein Ring, keine festen Genre-Anker: Die Filme werden mit t-SNE frei im Raum verteilt, Inseln entstehen aus der Ähnlichkeit.

- Distanz zwischen zwei Filmen: `d = 1 - sim_layout + genreGap * (Hauptgenre verschieden) + subGap * (gleiches Hauptgenre, aber erstes Subgenre verschieden)`. Startwerte `genreGap = 0.35`, `subGap = 0.12`.
- Eigene t-SNE-Umsetzung auf der Distanzmatrix (Perplexity ca. 10, 1000 Iterationen, Early Exaggeration in den ersten 250), Seed-PRNG mulberry32, damit das Ergebnis immer gleich ist.
- Danach: auf ein Seitenverhältnis von 16:10 skalieren, Ränder mit 6 % Luft, kurze Kollisionsentspannung (Posterradius), damit nichts überlappt, aber die organischen Formen bleiben.
- `layoutAll(films, opts)` → `{ nodes, islands, clusters, edges }`, in Portionen lauffähig (onProgress). `placeOne(film, films, positions)`: gewichtetes Mittel der 5 ähnlichsten Positionen plus kleine Kollisionsentspannung, nur dieser Film bewegt sich.
- `islands`: pro Hauptgenre Schwerpunkt (ohne Ausreisser) und Film-IDs. Keine Inselflächen, keine Hüllen.
- Die Parameter in `similarity.config.js` (genreGap, subGap, perplexity usw.) hat Luciano bewusst auf eine enge, durchmischte Anordnung eingestellt. Nicht ändern.
- `clusters`: pro Hauptgenre und erstem Subgenre ab 3 Filmen, Schwerpunkt, keine Duplikate.
- Alle Parameter in `similarity.config.js` unter `layout`.

## A7. Ansicht und Interaktion

- Tabs oben: **Netzwerk** (ersetzt den bisherigen Genre-Tab), **Regie** und **Rating**. Regie und Rating bleiben exakt wie heute (Coverwand, Gruppierung, Sortierung, Farbschicht).
- Die bestehende Bedienung bleibt überall gleich, auch im Netzwerk: Klick öffnet, Klick auf den gewählten Film schliesst, Doppelklick/Doppeltipp markiert als gesehen, Favorit mit Rahmen, Regler 0–10 in 0,1-Schritten (0 = keine Wertung), Toggles Gesehen, Favorit, Als Nächstes.
- Netzwerk: Pan und Zoom (Maus, Trackpad, Pinch), drei Stufen: weit (Genre-Namen, Filme als Punkte), mittel (kleine Poster, Subgenre-Labels), nah (volle Poster). Stil: schwarzer Grund, jedes Hauptgenre hat eine gedämpfte Farbe (nur Punkte und Labels, keine Inselflächen), Labels weiss. Der Rating-Schalter ersetzt die Genre-Farben durch die Rating-Skala.
- Klick auf Film im Netzwerk: Panel, Film und Nachbarn hell, Rest abgedunkelt. Linien: durchgezogen = inhaltlich, gestrichelt = Regie, gepunktet = Darsteller/Franchise. Kamera schwenkt so, dass alles neben dem Panel sichtbar ist.
- Regie, Darsteller und Merkmal-Chips im Panel sind klickbar und heben im Netzwerk alle passenden Filme hervor (zusätzlich zum Regie-Tab).
- Suche findet Titel, Originaltitel, Regie, Darsteller.

## A8. Woher die Einordnung kommt

1. **TMDB** (gratis, nicht-kommerziell, Quellenangabe nötig). Token `TMDB_ACCESS_TOKEN` nur auf dem Server, nie im Browser. Suche über `/search/multi` (de-DE), IMDb-Link über `/find/{imdbId}?external_source=imdb_id`. Details über `/movie/{id}` bzw. `/tv/{id}` mit `append_to_response=keywords,credits,release_dates,external_ids` (Serien: `content_ratings`, Keywords unter `results`).
   - genres → Genres, keywords → Subgenres/Themen/Ton/Erzählstruktur/Epoche/Ort über `data/keyword-map.json`, credits → 3 Hauptdarsteller und Regie (Serien: `created_by`), production_countries/origin_country → Herkunft, Altersfreigabe (DE, sonst US) → Intensität (FSK 0/6 → 1, 12 → 2, 16 → 3, 18 → 4; Keywords wie gore, splatter, extreme violence → 5), `vote_average`/`vote_count` → TMDB-Wertung, Poster.
2. **Wikidata** (gratis, ohne Schlüssel): SPARQL über IMDb-ID (P345): P840 Handlungsort, P2408 Epoche, P921 Hauptthema, über dieselbe Tabelle abgebildet. Fehler werden ignoriert.
3. **`data/keyword-map.json`**: bildet TMDB-Keywords (englisch, klein) und Wikidata-Labels auf das Vokabular ab. Nicht abgebildete Keywords werden im Report gezählt.
4. Pro Facette Werte nach Trefferzahl sortieren und auf die Grenzen aus A3 kürzen.
5. Lücken (meist Ton und Erzählstruktur) bleiben leer und werden im Panel ergänzt. Optional lokal: Ollama füllt nur leere Facetten (`ENRICH_PROVIDER=ollama`, `OLLAMA_MODEL`). In der geteilten Version nicht aktiv.

## A9. Neue Filme

1. `/api/film?q=…` liefert `{ film, facets }` nach A8. Antworten werden 24 h gecacht (`Cache-Control: s-maxage=86400`), damit TMDB geschont wird.
2. Der Browser platziert den Film mit `Layout.placeOne`. Alle anderen Filme bleiben fix.
3. Panel: «Merkmale aus TMDB übernommen – bitte prüfen», leere Facetten als «fehlt». Bearbeiten-Modus mit Chips aus dem Vokabular. Speichern setzt `source: 'manuell'`, `reviewed: true` und platziert nur diesen Film neu.
4. Duplikate (gleiche IMDb- oder TMDB-ID) werden nicht angelegt, sondern geöffnet.

## A10. Wertungen

- Standard überall: **TMDB-Wertung** (`vote_average`, Anzahl Stimmen), beschriftet mit «TMDB».
- **IMDb-Wertung nur lokal und optional:** `scripts/update_imdb_ratings.mjs` lädt `title.ratings.tsv.gz` von https://datasets.imdbws.com/ (offizieller Datensatz, nur persönliche, nicht-kommerzielle Nutzung) und schreibt `data/imdb-ratings.json`. Diese Datei steht in `.gitignore` und wird nie veröffentlicht. Die App zeigt IMDb nur, wenn die Datei vorhanden ist. Die alten IMDb-Werte in `films.js` werden in der App nicht mehr angezeigt.
- Kein Abruf von imdb.com oder IMDb-Endpunkten, auch nicht über Cinemeta.
- Quellenzeile: «Daten und Bilder: TMDB. Dieses Produkt nutzt die TMDB-API, ist aber nicht von TMDB unterstützt oder zertifiziert.» Bei lokaler IMDb-Anzeige zusätzlich «IMDb-Wertungen: IMDb (https://www.imdb.com). Used with permission.»

## A11. Eigenes Archiv für jede Person

- Alle persönlichen Daten liegen im localStorage unter `moviebylucia-archive-v2`: `{ version: 2, startList: 'luciano' | 'leer', hidden: [], added: [], facetOverrides: {}, positions: {}, entries: { id: { rating, watched, favorite, next, memo } } }`. Alte Schlüssel (`moviebylucia-v1`, `moviebylucia-added-v1`) werden beim ersten Start übernommen.
- Erster Besuch: Auswahl «Mit Lucianos Liste starten», «Leer starten» oder «Eigene Liste einfügen» (ein Titel pro Zeile, optional mit Jahr oder IMDb-/TMDB-Link; oder CSV mit Spalten Name/Title und Year, z. B. Letterboxd-Export).
- Import mehrerer Titel: je 3 gleichzeitig, Fortschritt «34 / 120», Liste nicht gefundener Titel mit «nochmals suchen», Duplikate übersprungen. Danach automatisch `Layout.layoutAll` im Browser (in Portionen, UI bleibt bedienbar) und Positionen speichern.
- Menü neben dem Plus: Export (JSON), Import, Karte neu ordnen, Archiv zurücksetzen (mit Eingabe von «zurücksetzen», kein Browser-Dialog).
- Panel: «Aus meinem Archiv entfernen» (Startlisten-Filme werden versteckt, eigene gelöscht).
- `scripts/apply_export.mjs` übernimmt einen Export von Luciano in die Startliste (`data/facets.json`, `data/added-films.json`, danach `npm run graph`).

## A12. Kosten und Betrieb

- Hosting: Vercel Hobby (gratis, nicht-kommerziell). Einzige Umgebungsvariable: `TMDB_ACCESS_TOKEN`.
- Datenquellen: TMDB, Wikidata, optional Cinemeta für Ergänzungen. Alles gratis, keine KI-Dienste.
- Keine Datenbank: jede Person hat ihr Archiv im eigenen Browser, gesichert über Export.

---

# Teil 2 – Freunde, Profile und gemeinsame Wunschlisten

Grundlage für Prompt 10 bis 15. Setzt voraus, dass Prompt 0 bis 9 umgesetzt sind.

## A13. Grundidee

- Wer sich anmeldet, hat ein Profil. Archiv, Wertungen und Wunschlisten werden in einer Datenbank gespeichert und sind auf jedem Gerät gleich.
- Ohne Anmeldung funktioniert alles wie bisher lokal im Browser.
- Freunde sehen gegenseitig, welche Filme der andere wie bewertet hat, was er gesehen hat und was auf seiner Liste «Als Nächstes» steht. Notizen bleiben immer privat.
- Wunschlisten können mehrere Mitglieder haben. Alle Mitglieder können Filme hinzufügen, entfernen und mit «Will ich» markieren. Änderungen erscheinen bei allen sofort.
- Oben kommt ein vierter Tab mit Personen-Icon: **Netzwerk · Regie · Rating · (Person)**.

## A14. Dienst und Kosten

- **Supabase**, Gratis-Plan: Postgres-Datenbank, Anmeldung, Realtime. Projekte im Gratis-Plan pausieren nach 7 Tagen ohne Nutzung und müssen dann im Supabase-Dashboard mit einem Klick fortgesetzt werden.
- Im Browser wird `@supabase/supabase-js@2` als ES-Modul von `https://esm.sh` geladen. Das ist die einzige Browser-Abhängigkeit.
- `config.js` enthält `SUPABASE_URL` und den öffentlichen `SUPABASE_ANON_KEY`. Der Anon-Key darf öffentlich sein, die Sicherheit kommt aus Row Level Security (RLS). Der `service_role`-Key kommt nie in den Code.
- Anmeldung: E-Mail + Passwort (E-Mail-Bestätigung im Dashboard ausgeschaltet, damit keine Mails nötig sind). Optional zusätzlich «Mit Google anmelden».

## A15. Einheitliche Film-IDs

Damit Freunde vom selben Film sprechen, gilt überall die ID `tmdb:movie:27205` bzw. `tmdb:tv:1399`. Die Startlisten-IDs (`f001` …) werden über `tmdbId`/`tmdbType` aus `data/facets.json` abgebildet. Lokale Daten werden beim ersten Start nach diesem Schritt einmalig umgeschlüsselt. Filme ohne TMDB-ID behalten ihre alte ID und werden nicht synchronisiert, bis sie zugeordnet sind.

## A16. Datenbank (`supabase/schema.sql`)

- `profiles` (id = auth.users.id, `username` eindeutig, klein, 3–20 Zeichen a–z0–9_, `display_name`, `share_ratings` bool Standard true, `created_at`). Wird per Trigger beim Registrieren angelegt.
- `friendships` (`id`, `requester`, `addressee`, `status` 'pending' | 'accepted', `created_at`), eindeutig pro Paar unabhängig von der Richtung.
- `films` (gemeinsamer Katalog): `id` (A15), `imdb_id`, `title`, `original_title`, `year`, `kind`, `poster`, `tmdb_rating`, `tmdb_votes`, `facets` jsonb, `updated_at`.
- `entries` (`user_id`, `film_id`, `rating` numeric 0–10 oder null, `watched`, `favorite`, `next`, `in_archive`, `hidden`, `facet_overrides` jsonb, `pos_x`, `pos_y`, `updated_at`), Primärschlüssel (user_id, film_id).
- `notes` (`user_id`, `film_id`, `memo`, `updated_at`), nur für den Besitzer lesbar.
- `wishlists` (`id`, `title`, `created_by`, `created_at`).
- `wishlist_members` (`wishlist_id`, `user_id`, `role` 'owner' | 'editor', `added_at`).
- `wishlist_items` (`id`, `wishlist_id`, `film_id`, `added_by`, `note`, `status` 'offen' | 'geschaut', `created_at`), eindeutig pro (wishlist_id, film_id).
- `wishlist_votes` (`item_id`, `user_id`, `created_at`) = «Will ich».

**RLS-Regeln:**
- Hilfsfunktion `are_friends(a, b)` (security definer, stable).
- `profiles`: lesen für angemeldete Nutzer (nur id, username, display_name), ändern nur das eigene.
- `friendships`: lesen, wenn man beteiligt ist; anlegen nur als requester; annehmen nur als addressee; löschen durch beide.
- `entries`: eigene vollständig; lesen von Freunden nur, wenn `are_friends` und deren `share_ratings` true ist.
- `notes`: nur eigene.
- `films`: lesen für alle Angemeldeten; anlegen und ändern für Angemeldete (Katalog).
- `wishlists`, `wishlist_items`, `wishlist_votes`: lesen und schreiben nur für Mitglieder; Mitglieder hinzufügen nur durch owner und nur Freunde; eigene Votes setzen und löschen.
- Realtime für `wishlist_items`, `wishlist_votes`, `wishlist_members`, `friendships`.
- Funktion `delete_my_account()` löscht alle eigenen Daten und den Auth-Nutzer.

## A17. Synchronisation

- `store.js` bekommt zwei Speicher: lokal (wie bisher) und Cloud. Angemeldet ist die Cloud die Quelle, localStorage dient als Zwischenspeicher für schnellen Start und offline.
- Erste Anmeldung auf einem Gerät mit lokalen Daten: Dialog «Lokales Archiv mit deinem Konto zusammenführen?» Bei Konflikten gewinnt der neuere `updated_at`.
- Änderungen werden gebündelt (Debounce 800 ms) geschrieben. Offline gesammelte Änderungen werden nachgeholt. Fehler zeigen eine dezente Meldung «Nicht gespeichert – erneut versuchen».
- Hinzugefügte Filme landen im Katalog `films` (upsert), damit Freunde Titel, Poster und Facetten sehen.

## A18. Freunde-Tab

- **Nicht angemeldet:** Anmelden / Registrieren (E-Mail, Passwort, Benutzername), kurzer Text, dass Notizen privat bleiben.
- **Mein Profil:** Name, @benutzername, Zahlen (bewertet, gesehen, Wunschlisten), Einstellung «Wertungen für Freunde sichtbar», Abmelden, Konto löschen (Eingabe «löschen» zur Bestätigung).
- **Freunde:** Liste, Suche nach Benutzername, Einladungslink `/?freund=benutzername`, offene Anfragen (annehmen, ablehnen), Freund entfernen.
- **Profil eines Freundes:** Coverwand seiner Filme gruppiert nach seiner Wertung (wie der Rating-Tab), oben ein Vergleich: «Ihr habt beide gesehen: 23», «Euer grösster Unterschied», «Hat er hoch bewertet, du noch nicht gesehen». Seine «Als Nächstes»-Liste.
- **Im Panel jedes Films:** Zeile «Freunde» mit den Wertungen der Freunde, die den Film bewertet haben, und Button «Zu Wunschliste hinzufügen».
- **Im Netzwerk:** Schalter «Mit Freund vergleichen» färbt die Karte nach der Wertung eines gewählten Freundes. Filme, die er nicht hat, werden ausgeblendet.
- **Wunschlisten:** Übersicht aller Listen, in denen man Mitglied ist. Neue Liste mit Titel und Freunden als Mitgliedern. In der Liste: Filme mit Poster, wer ihn hinzugefügt hat, «Will ich»-Zähler mit Namen, Sortierung nach Stimmen oder neu. Filme hinzufügen über Suche (eigenes Archiv, Freunde-Archive, TMDB). Status «zusammen geschaut», danach Hinweis an alle Mitglieder, den Film zu bewerten. Mitglieder verwalten (owner), Liste verlassen, Liste löschen (owner).
- Gestaltung im bestehenden Stil. Das Personen-Icon ist ein Inline-SVG im gleichen Strich wie das Plus-Icon.

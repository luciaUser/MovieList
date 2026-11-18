# Supabase einrichten

Die App läuft lokal ohne diese Schritte weiter. Sobald `SUPABASE_URL` und `SUPABASE_ANON_KEY` in `config.js` stehen, wird ein Profil Pflicht. Die Anmelde-Oberfläche kommt im nächsten Schritt.

## 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Projekt im Gratis-Plan anlegen.
2. Region wählen und das Datenbank-Passwort speichern.
3. Warten, bis das Projekt „Healthy“ ist.

Projekte im Gratis-Plan pausieren nach 7 Tagen ohne Nutzung. Im Dashboard lässt sich ein pausiertes Projekt mit einem Klick fortsetzen.

## 2. Tabellen anlegen

1. Im Projekt **SQL Editor** öffnen.
2. Den gesamten Inhalt von `supabase/schema.sql` einfügen und ausführen.
3. Dasselbe Script darf später noch einmal laufen. Es ersetzt Funktionen und Policies, legt Tabellen aber nicht doppelt an.

## 3. E-Mail-Bestätigung ausschalten

Authentication → Providers → Email → **Confirm email** aus.

Der Login ist nur Benutzername und Passwort. Supabase bekommt intern eine Adresse `benutzername@users.invalid`. An diese Adresse wird nie eine Mail geschickt. Die freiwillige Wiederherstellungs-Adresse liegt in `recovery_emails` und wird über den eigenen SMTP-Dienst angeschrieben.

## 4. Prüfen, ob `users.invalid` akzeptiert wird

Authentication → Users → Add user.

- E-Mail: `probe@users.invalid`
- Auto Confirm User: ein
- User Metadata: `{"username":"probe"}`

Speichern. Danach in **SQL Editor**:

```sql
select id, username from public.profiles where username = 'probe';
```

Es muss eine Zeile erscheinen. Den Probe-Nutzer danach wieder löschen.

Lehnt das Formular `.invalid` ab, eine andere reservierte Domain wählen, die keine Postfächer hat, zum Beispiel `users.localhost`. Dieselbe Domain an drei Stellen eintragen:

- `config.js`, Feld `AUTH_DOMAIN`
- lokal in `.env` als `AUTH_DOMAIN`
- auf Vercel als Umgebungsvariable `AUTH_DOMAIN`

`cloud.js` und `api/recovery.js` lesen diesen Wert. Ohne Eintrag bleibt es bei `users.invalid`.

## 5. Site URL und Redirect URLs

Authentication → URL Configuration.

- Site URL: die Vercel-Adresse, zum Beispiel `https://movielist.vercel.app`
- Redirect URLs, je eine Zeile:
  - `https://movielist.vercel.app`
  - `http://localhost:8741`
  - `http://127.0.0.1:8755` nur, wenn du lokal einen anderen Port nutzt

Der Link zum Zurücksetzen des Passworts führt auf diese Adressen zurück.

## 6. URL und Anon-Key in die App

Project Settings → API.

In `config.js` die leeren Strings ersetzen:

- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = der öffentliche `anon` Key

Der Anon-Key darf im Browser stehen. Er darf keine Zeile lesen, die die Policies nicht freigeben. Den `service_role` Key nie in `config.js` oder ins Repository schreiben.

Solange beide Strings leer sind, bleibt `profileRequired` falsch und die App verlangt kein Profil.

## 7. Server-Geheimnisse

Lokal liegen sie nur in `.env` (die Datei ist in `.gitignore`). Vorlage ohne Werte: `.env.example`.

```
TMDB_ACCESS_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
AUTH_DOMAIN=
```

`SUPABASE_URL` ist dieselbe Adresse wie in `config.js`. `SUPABASE_SERVICE_ROLE_KEY` steht im Dashboard unter Project Settings → API als `service_role`.

`npm run dev` liest `.env` bereits. Der lokale Server und die Vercel-Funktion `api/recovery.js` nutzen dasselbe Modul.

Auf Vercel dieselben Namen unter Project → Settings → Environment Variables eintragen. Nicht ins Git legen.

Fehlen Service-Role-Key oder SMTP-Werte, antwortet `GET /api/recovery?action=status` mit `{ "enabled": false }`. Bestätigen und Zurücksetzen antworten dann mit einer klaren Meldung statt einen Link zu schicken.

## 8. SMTP, zum Beispiel Brevo

1. Konto bei [Brevo](https://www.brevo.com) anlegen.
2. Absender-Adresse bestätigen (SMTP & API → Absender).
3. SMTP-Schlüssel erzeugen (SMTP & API → SMTP).
4. Eintragen:
   - `SMTP_HOST` = `smtp-relay.brevo.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = die Login-Adresse bei Brevo
   - `SMTP_PASS` = der SMTP-Schlüssel
   - `MAIL_FROM` = die bestätigte Absender-Adresse, zum Beispiel `MovieByLucia <du@deinedomain.ch>`

Ein anderer Anbieter mit denselben fünf Werten geht genauso.

## 9. Passwort im Dashboard zurücksetzen

Ohne bestätigte Wiederherstellungs-Adresse: Authentication → Users → den Nutzer öffnen → **Reset password** bzw. das Passwort dort neu setzen. In der App steht dann später der Hinweis „Passwort vergessen? Melde dich bei Luciano.“

## 10. Policies prüfen

Wenn `anna` und `tom` als Nutzer existieren, `supabase/test_rls.sql` im SQL-Editor ausführen. Jede bestandene Prüfung erscheint als NOTICE. Am Ende macht das Script ein ROLLBACK, die Testdaten bleiben nicht liegen.

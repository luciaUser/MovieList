-- Prüfung der RLS-Regeln mit zwei Testnutzern.
-- Das Script legt Testdaten an und macht alles am Ende mit ROLLBACK rückgängig.
-- Die beiden Profile müssen vorher existieren.
--
-- 1. Authentication → Users → Add user.
--    E-Mail: anna@users.invalid  und  tom@users.invalid
--    Passwort egal. „Auto Confirm User“ einschalten.
--    User Metadata: {"username":"anna"} bzw. {"username":"tom"}
--    Fehlt die Metadata, setzt der Trigger den Namen aus dem Teil vor dem @.
-- 2. Prüfen: select id, username from public.profiles;
-- 3. Dieses Script im SQL-Editor ausführen.
--    Jede Prüfung schreibt ein NOTICE. Ein EXCEPTION bricht ab und rollt zurück.

begin;

do $$
declare
  anna uuid;
  tom uuid;
  seen integer;
  list_id uuid;
  item_id uuid;
begin
  select id into anna from public.profiles where username = 'anna';
  select id into tom from public.profiles where username = 'tom';
  if anna is null or tom is null then
    raise exception 'Lege zuerst die Nutzer anna und tom an (siehe Kommentare oben).';
  end if;

  update public.profiles set is_private = true where id = tom;
  update public.profiles set is_private = false where id = anna;

  insert into public.films (id, title) values ('tmdb:movie:278', 'Die Verurteilten')
  on conflict (id) do nothing;

  insert into public.entries (user_id, film_id, rating, watched, in_archive)
  values (tom, 'tmdb:movie:278', 8, true, true);

  insert into public.notes (user_id, film_id, memo)
  values (tom, 'tmdb:movie:278', 'nur für tom');

  insert into public.recovery_emails (user_id, email)
  values (tom, 'tom@example.com');

  -- Anna ist angemeldet und folgt tom noch nicht.
  perform set_config('request.jwt.claim.sub', anna::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', anna)::text, true);
  execute 'set local role authenticated';

  select count(*) into seen from public.entries where user_id = tom;
  if seen <> 0 then
    raise exception 'Anna sieht Toms Einträge, obwohl das Profil privat ist (%).', seen;
  end if;
  raise notice 'OK: privates Profil versteckt Einträge';

  select count(*) into seen from public.notes where user_id = tom;
  if seen <> 0 then
    raise exception 'Anna sieht Toms Notizen (%).', seen;
  end if;
  raise notice 'OK: fremde Notizen bleiben unsichtbar';

  select count(*) into seen from public.recovery_emails where user_id = tom;
  if seen <> 0 then
    raise exception 'Anna sieht Toms Wiederherstellungs-E-Mail (%).', seen;
  end if;
  raise notice 'OK: fremde Wiederherstellungs-E-Mails bleiben unsichtbar';

  reset role;

  -- Tom legt eine Wunschliste an und legt einen Film darauf. Anna ist kein Mitglied.
  insert into public.wishlists (title, created_by) values ('Zusammen', tom)
  returning id into list_id;
  insert into public.wishlist_items (wishlist_id, film_id, added_by)
  values (list_id, 'tmdb:movie:278', tom)
  returning id into item_id;

  perform set_config('request.jwt.claim.sub', anna::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', anna)::text, true);
  execute 'set local role authenticated';

  select count(*) into seen from public.wishlists where id = list_id;
  if seen <> 0 then
    raise exception 'Anna sieht eine fremde Wunschliste.';
  end if;
  select count(*) into seen from public.wishlist_items where wishlist_id = list_id;
  if seen <> 0 then
    raise exception 'Anna sieht Filme einer fremden Wunschliste.';
  end if;
  raise notice 'OK: Aussenstehende sehen keine Liste und keine Filme';

  reset role;

  -- Ohne gegenseitiges Folgen darf Tom Anna nicht hinzufügen.
  perform set_config('request.jwt.claim.sub', tom::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', tom)::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.wishlist_members (wishlist_id, user_id, role)
    values (list_id, anna, 'editor');
    raise exception 'Mitglied wurde ohne gegenseitiges Folgen akzeptiert.';
  exception
    when insufficient_privilege then
      raise notice 'OK: Mitglied ohne gegenseitiges Folgen abgelehnt';
  end;

  reset role;

  -- Gegenseitig folgen: Anna ist öffentlich, also direkt accepted.
  -- Tom ist privat, also bleibt Annas Folge pending, bis Tom annimmt.
  insert into public.follows (follower, followee) values (tom, anna);
  insert into public.follows (follower, followee) values (anna, tom);

  if (select status from public.follows where follower = tom and followee = anna) <> 'accepted' then
    raise exception 'Öffentliches Profil wurde nicht direkt accepted.';
  end if;
  if (select status from public.follows where follower = anna and followee = tom) <> 'pending' then
    raise exception 'Privates Profil wurde nicht pending.';
  end if;
  raise notice 'OK: öffentlich accepted, privat pending';

  update public.follows set status = 'accepted' where follower = anna and followee = tom;

  perform set_config('request.jwt.claim.sub', tom::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', tom)::text, true);
  execute 'set local role authenticated';

  insert into public.wishlist_members (wishlist_id, user_id, role)
  values (list_id, anna, 'editor');
  raise notice 'OK: Mitglied bei gegenseitigem Folgen hinzugefügt';

  reset role;

  -- Nach der angenommenen Folge sieht Anna Toms Eintrag, aber nicht die Notiz.
  perform set_config('request.jwt.claim.sub', anna::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', anna)::text, true);
  execute 'set local role authenticated';

  select count(*) into seen from public.entries where user_id = tom;
  if seen <> 1 then
    raise exception 'Anna sieht den Eintrag nach der Folge nicht (%).', seen;
  end if;
  select count(*) into seen from public.notes where user_id = tom;
  if seen <> 0 then
    raise exception 'Die Notiz wurde durch die Folge sichtbar.';
  end if;
  raise notice 'OK: Folge öffnet Einträge und lässt Notizen privat';

  select count(*) into seen from public.wishlist_items where wishlist_id = list_id;
  if seen <> 1 then
    raise exception 'Mitglied sieht den Film auf der Liste nicht (%).', seen;
  end if;
  insert into public.wishlist_votes (item_id, user_id) values (item_id, anna);
  raise notice 'OK: Mitglied sieht die Liste und setzt Will ich';
end $$;

rollback;

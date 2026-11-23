const config = globalThis.AppConfig || {};
const url = typeof config.SUPABASE_URL === 'string' ? config.SUPABASE_URL.trim() : '';
const anonKey = typeof config.SUPABASE_ANON_KEY === 'string' ? config.SUPABASE_ANON_KEY.trim() : '';
const domain = typeof config.AUTH_DOMAIN === 'string' && config.AUTH_DOMAIN.trim()
  ? config.AUTH_DOMAIN.trim()
  : 'users.invalid';
const namePattern = /^[a-z0-9_]{3,20}$/;

function normalize(username) {
  return String(username || '').trim().toLowerCase();
}

function authEmail(username) {
  return `${normalize(username)}@${domain}`;
}

function unavailable() {
  return Promise.reject(new Error('Anmeldung ist nicht eingerichtet.'));
}

function disabledCloud() {
  return {
    enabled: false,
    ready: true,
    signUp: unavailable,
    signIn: unavailable,
    signOut: unavailable,
    getSession: () => Promise.resolve(null),
    onAuthChange() { return () => {}; },
    usernameAvailable: unavailable,
  };
}

function requireName(username) {
  const name = normalize(username);
  if (!namePattern.test(name)) {
    throw new Error('Der Benutzername braucht 3 bis 20 Zeichen: a–z, 0–9 oder _.');
  }
  return name;
}

async function start() {
  if (!url || !anonKey) {
    globalThis.Cloud = disabledCloud();
    globalThis.dispatchEvent(new Event('cloud:ready'));
    return;
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  async function currentUser() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data && data.session && data.session.user;
    if (!user) throw new Error('Keine Verbindung.');
    return user;
  }

  const Cloud = {
    enabled: true,
    ready: true,
    async signUp(username, password, recoveryEmail) {
      const name = requireName(username);
      const { data, error } = await client.auth.signUp({
        email: authEmail(name),
        password,
        options: { data: { username: name } },
      });
      if (error) throw error;
      const user = data && data.user;
      const email = typeof recoveryEmail === 'string' ? recoveryEmail.trim() : '';
      if (user && email && data.session) {
        const { error: mailError } = await client.from('recovery_emails').upsert({
          user_id: user.id,
          email,
          verified: false,
          updated_at: new Date().toISOString(),
        });
        if (mailError) throw mailError;
      }
      return data;
    },
    async signIn(username, password) {
      const name = requireName(username);
      const { data, error } = await client.auth.signInWithPassword({
        email: authEmail(name),
        password,
      });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    onAuthChange(fn) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (typeof fn === 'function') fn(event, session);
      });
      return () => data.subscription.unsubscribe();
    },
    async usernameAvailable(username) {
      const name = requireName(username);
      const { data, error } = await client.rpc('username_available', { name });
      if (error) throw error;
      return Boolean(data);
    },
    async updatePassword(password) {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      return data;
    },
    async profile() {
      const user = await currentUser();
      const { data, error } = await client.from('profiles').select('id, username, display_name, is_private').eq('id', user.id).single();
      if (error) throw error;
      return data;
    },
    async profileExtra() {
      const user = await currentUser();
      const [stats, extra] = await Promise.all([
        client.rpc('profile_stats', { target: user.id }),
        client.rpc('profile_sensitive', { target: user.id }),
      ]);
      if (stats.error) throw stats.error;
      if (extra.error) throw extra.error;
      const statRow = Array.isArray(stats.data) ? stats.data[0] : stats.data;
      const extraRow = Array.isArray(extra.data) ? extra.data[0] : extra.data;
      return {
        stats: statRow || { films: 0, followers: 0, following: 0 },
        sensitive: extraRow || { top_films: [], pinned_people: { actors: [], directors: [] } },
      };
    },
    async updateProfile(patch) {
      const user = await currentUser();
      const { error } = await client.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;
    },
    async followNames() {
      const user = await currentUser();
      const { data, error } = await client.from('follows')
        .select('follower, followee, status')
        .or(`follower.eq.${user.id},followee.eq.${user.id}`);
      if (error) throw error;
      const rows = data || [];
      const ids = new Set();
      rows.forEach((row) => {
        ids.add(row.follower);
        ids.add(row.followee);
      });
      ids.delete(user.id);
      let people = [];
      if (ids.size) {
        const found = await client.from('profiles').select('id, username, display_name').in('id', [...ids]);
        if (found.error) throw found.error;
        people = found.data || [];
      }
      const byId = new Map(people.map((person) => [person.id, person]));
      const personOf = (id) => {
        const person = byId.get(id);
        return {
          id,
          username: person && person.username ? person.username : '',
          name: person ? (person.display_name || person.username || 'Profil') : 'Profil',
        };
      };
      const requests = rows
        .filter((row) => row.followee === user.id && row.status === 'pending')
        .map((row) => personOf(row.follower));
      return {
        followers: rows.filter((row) => row.followee === user.id && row.status === 'accepted').map((row) => personOf(row.follower)),
        following: rows.filter((row) => row.follower === user.id && row.status === 'accepted').map((row) => personOf(row.followee)),
        requests,
        pending: requests.length,
      };
    },
    async searchProfiles(query) {
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      const rpc = await client.rpc('search_profiles', { query: q });
      if (!rpc.error) return rpc.data || [];
      const missing = rpc.error.code === 'PGRST202'
        || /search_profiles|schema cache/i.test(rpc.error.message || '');
      if (!missing) throw rpc.error;
      const user = await currentUser();
      const safe = q.replace(/[%_,."()]/g, '');
      if (safe.length < 2) return [];
      const pattern = `"%${safe}%"`;
      const found = await client.from('profiles')
        .select('id, username, display_name, is_private')
        .neq('id', user.id)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(10);
      if (found.error) throw found.error;
      return (found.data || []).filter((row) => row.id !== user.id).slice(0, 10);
    },
    async profileByUsername(name) {
      const clean = normalize(name);
      if (!clean) return null;
      const { data, error } = await client.from('profiles')
        .select('id, username, display_name, is_private')
        .eq('username', clean)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async loadOther(target) {
      const user = await currentUser();
      const profileResult = await client.from('profiles')
        .select('id, username, display_name, is_private')
        .eq('id', target)
        .maybeSingle();
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) return null;
      const [stats, sensitive, follow, view] = await Promise.all([
        client.rpc('profile_stats', { target }),
        client.rpc('profile_sensitive', { target }),
        client.from('follows').select('status').eq('follower', user.id).eq('followee', target).maybeSingle(),
        client.rpc('can_view', { viewer: user.id, owner: target }),
      ]);
      if (stats.error) throw stats.error;
      if (sensitive.error) throw sensitive.error;
      if (follow.error) throw follow.error;
      if (view.error) throw view.error;
      const canView = Boolean(view.data);
      let entries = [];
      let films = [];
      let head = null;
      let headFilms = [];
      if (!canView && profileResult.data.is_private === false) {
        const headResult = await client.rpc('profile_head', { target });
        const missing = headResult.error && (
          headResult.error.code === 'PGRST202'
          || /profile_head|schema cache/i.test(headResult.error.message || '')
        );
        if (headResult.error && !missing) throw headResult.error;
        if (!headResult.error) {
          head = Array.isArray(headResult.data) ? headResult.data[0] : headResult.data;
          const ids = head && Array.isArray(head.top_films) ? head.top_films.filter(Boolean) : [];
          if (ids.length) {
            const listed = await client.from('films')
              .select('id, title, original_title, year, kind, poster, tmdb_rating, tmdb_votes, facets')
              .in('id', ids);
            if (listed.error) throw listed.error;
            headFilms = listed.data || [];
          }
        }
      }
      if (canView) {
        const entryResult = await client.from('entries')
          .select('film_id, rating, watched, favorite, next, in_archive, hidden, facet_overrides, updated_at')
          .eq('user_id', target);
        if (entryResult.error) throw entryResult.error;
        entries = entryResult.data || [];
        const ids = [...new Set(entries.map((row) => row.film_id).filter(Boolean))];
        if (ids.length) {
          const filmResult = await client.from('films')
            .select('id, title, original_title, year, kind, poster, tmdb_rating, tmdb_votes, facets')
            .in('id', ids);
          if (filmResult.error) throw filmResult.error;
          films = filmResult.data || [];
        }
      }
      const statRow = Array.isArray(stats.data) ? stats.data[0] : stats.data;
      const extraRow = Array.isArray(sensitive.data) ? sensitive.data[0] : sensitive.data;
      return {
        profile: profileResult.data,
        stats: statRow || { films: 0, followers: 0, following: 0 },
        sensitive: extraRow || null,
        canView,
        follow: follow.data && follow.data.status ? follow.data.status : 'none',
        entries,
        films,
        head,
        headFilms,
      };
    },
    async follow(target) {
      const user = await currentUser();
      const { error } = await client.from('follows').insert({ follower: user.id, followee: target });
      if (error) throw error;
    },
    async unfollow(target) {
      const user = await currentUser();
      const { error } = await client.from('follows').delete().eq('follower', user.id).eq('followee', target);
      if (error) throw error;
    },
    async removeFollower(target) {
      const user = await currentUser();
      const { error } = await client.from('follows').delete().eq('followee', user.id).eq('follower', target);
      if (error) throw error;
    },
    async acceptFollow(target) {
      const user = await currentUser();
      const { error } = await client.from('follows')
        .update({ status: 'accepted' })
        .eq('followee', user.id)
        .eq('follower', target);
      if (error) throw error;
    },
    async declineFollow(target) {
      const user = await currentUser();
      const { error } = await client.from('follows').delete().eq('followee', user.id).eq('follower', target);
      if (error) throw error;
    },
    async wishOverview() {
      const user = await currentUser();
      const members = await client.from('wishlist_members').select('wishlist_id, user_id, role');
      if (members.error) throw members.error;
      const rows = members.data || [];
      if (!rows.length) return [];
      const listIds = [...new Set(rows.map((row) => row.wishlist_id))];
      const peopleIds = [...new Set(rows.map((row) => row.user_id))];
      const [lists, people, items] = await Promise.all([
        client.from('wishlists').select('id, title, created_by').in('id', listIds),
        client.from('profiles').select('id, username').in('id', peopleIds),
        client.from('wishlist_items').select('id, wishlist_id, status, created_at, added_by').in('wishlist_id', listIds),
      ]);
      if (lists.error) throw lists.error;
      if (people.error) throw people.error;
      if (items.error) throw items.error;
      const names = new Map((people.data || []).map((person) => [person.id, person.username || '']));
      return (lists.data || []).map((list) => {
        const group = rows.filter((row) => row.wishlist_id === list.id);
        const mine = group.find((row) => row.user_id === user.id);
        const listItems = (items.data || []).filter((item) => item.wishlist_id === list.id);
        return {
          id: list.id,
          title: list.title,
          createdBy: list.created_by,
          role: mine ? mine.role : 'editor',
          members: group.map((row) => ({
            id: row.user_id,
            username: names.get(row.user_id) || 'Profil',
            role: row.role,
          })).sort((a, b) => (a.role === 'owner' ? -1 : 0) - (b.role === 'owner' ? -1 : 0) || a.username.localeCompare(b.username, 'de')),
          openCount: listItems.filter((item) => item.status !== 'geschaut').length,
          stamps: listItems.map((item) => ({
            id: item.id,
            createdAt: item.created_at,
            addedBy: item.added_by,
          })),
        };
      }).sort((a, b) => a.title.localeCompare(b.title, 'de'));
    },
    async wishDetail(listId) {
      const user = await currentUser();
      const items = await client.from('wishlist_items')
        .select('id, wishlist_id, film_id, added_by, status, created_at')
        .eq('wishlist_id', listId);
      if (items.error) throw items.error;
      const rows = items.data || [];
      const filmIds = [...new Set(rows.map((row) => row.film_id))];
      const itemIds = rows.map((row) => row.id);
      const [films, votes] = await Promise.all([
        filmIds.length
          ? client.from('films').select('id, title, original_title, year, poster, kind, facets').in('id', filmIds)
          : Promise.resolve({ data: [], error: null }),
        itemIds.length
          ? client.from('wishlist_votes').select('item_id, user_id').in('item_id', itemIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (films.error) throw films.error;
      if (votes.error) throw votes.error;
      const peopleIds = [...new Set(rows.map((row) => row.added_by).concat((votes.data || []).map((row) => row.user_id)).filter(Boolean))];
      let names = new Map();
      if (peopleIds.length) {
        const people = await client.from('profiles').select('id, username').in('id', peopleIds);
        if (people.error) throw people.error;
        names = new Map((people.data || []).map((person) => [person.id, person.username || 'Profil']));
      }
      const filmById = new Map((films.data || []).map((row) => [row.id, row]));
      return rows.map((row) => ({
        id: row.id,
        filmId: row.film_id,
        film: filmById.get(row.film_id) || null,
        addedBy: row.added_by,
        addedName: names.get(row.added_by) || 'Profil',
        status: row.status,
        createdAt: row.created_at,
        votes: (votes.data || []).filter((vote) => vote.item_id === row.id).map((vote) => ({
          id: vote.user_id,
          username: names.get(vote.user_id) || 'Profil',
        })),
        mine: (votes.data || []).some((vote) => vote.item_id === row.id && vote.user_id === user.id),
      }));
    },
    async followedFilms(userIds) {
      const ids = [...new Set((userIds || []).filter(Boolean))];
      if (!ids.length) return [];
      const entries = await client.from('entries')
        .select('user_id, film_id')
        .in('user_id', ids)
        .eq('in_archive', true)
        .eq('hidden', false);
      if (entries.error) throw entries.error;
      const filmIds = [...new Set((entries.data || []).map((row) => row.film_id))];
      if (!filmIds.length) return [];
      const [films, people] = await Promise.all([
        client.from('films').select('id, title, original_title, year, poster, kind, facets').in('id', filmIds),
        client.from('profiles').select('id, username').in('id', ids),
      ]);
      if (films.error) throw films.error;
      if (people.error) throw people.error;
      const names = new Map((people.data || []).map((person) => [person.id, person.username || '']));
      const byFilm = new Map((films.data || []).map((row) => [row.id, row]));
      const grouped = new Map();
      (entries.data || []).forEach((row) => {
        const film = byFilm.get(row.film_id);
        if (!film) return;
        const current = grouped.get(film.id) || { film, names: [] };
        const name = names.get(row.user_id);
        if (name && !current.names.includes(name)) current.names.push(name);
        grouped.set(film.id, current);
      });
      return [...grouped.values()];
    },
    async watchedWishItems() {
      const items = await client.from('wishlist_items').select('id, film_id').eq('status', 'geschaut');
      if (items.error) throw items.error;
      const rows = items.data || [];
      const filmIds = [...new Set(rows.map((row) => row.film_id))];
      let films = [];
      if (filmIds.length) {
        const found = await client.from('films').select('id, title, original_title, year, poster, kind, facets').in('id', filmIds);
        if (found.error) throw found.error;
        films = found.data || [];
      }
      const byId = new Map(films.map((film) => [film.id, film]));
      return rows.map((row) => ({ id: row.id, filmId: row.film_id, film: byId.get(row.film_id) || null }));
    },
    async upsertFilm(row) {
      const { error } = await client.from('films').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    },
    async createWishlist(title, memberIds) {
      const user = await currentUser();
      const created = await client.from('wishlists').insert({ title, created_by: user.id }).select('id').single();
      if (created.error) throw created.error;
      const others = [...new Set((memberIds || []).filter((id) => id && id !== user.id))];
      if (others.length) {
        const inserted = await client.from('wishlist_members').insert(others.map((id) => ({
          wishlist_id: created.data.id,
          user_id: id,
          role: 'editor',
        })));
        if (inserted.error) throw inserted.error;
      }
      return created.data.id;
    },
    async renameWishlist(listId, title) {
      const { error } = await client.from('wishlists').update({ title }).eq('id', listId);
      if (error) throw error;
    },
    async deleteWishlist(listId) {
      const { error } = await client.from('wishlists').delete().eq('id', listId);
      if (error) throw error;
    },
    async leaveWishlist(listId) {
      const user = await currentUser();
      const { error } = await client.from('wishlist_members').delete().eq('wishlist_id', listId).eq('user_id', user.id);
      if (error) throw error;
    },
    async addWishlistMember(listId, userId) {
      const { error } = await client.from('wishlist_members').insert({
        wishlist_id: listId,
        user_id: userId,
        role: 'editor',
      });
      if (error) throw error;
    },
    async removeWishlistMember(listId, userId) {
      const { error } = await client.from('wishlist_members').delete().eq('wishlist_id', listId).eq('user_id', userId);
      if (error) throw error;
    },
    async addWishlistItem(listId, filmId) {
      const user = await currentUser();
      const { error } = await client.from('wishlist_items').insert({
        wishlist_id: listId,
        film_id: filmId,
        added_by: user.id,
        status: 'offen',
      });
      if (error) throw error;
    },
    async removeWishlistItem(itemId) {
      const { error } = await client.from('wishlist_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    async setWishlistStatus(itemId, status) {
      const { error } = await client.from('wishlist_items').update({ status }).eq('id', itemId);
      if (error) throw error;
    },
    async voteWishlist(itemId, on) {
      const user = await currentUser();
      if (on) {
        const { error } = await client.from('wishlist_votes').insert({ item_id: itemId, user_id: user.id });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('wishlist_votes').delete().eq('item_id', itemId).eq('user_id', user.id);
      if (error) throw error;
    },
    async recoveryEmail() {
      const user = await currentUser();
      const { data, error } = await client.from('recovery_emails').select('email, verified').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async removeRecoveryEmail() {
      const user = await currentUser();
      const { error } = await client.from('recovery_emails').delete().eq('user_id', user.id);
      if (error) throw error;
    },
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error) throw error;
    },
    client,
  };

  globalThis.Cloud = Cloud;
  globalThis.dispatchEvent(new Event('cloud:ready'));
}

start().catch((error) => {
  globalThis.Cloud = disabledCloud();
  globalThis.Cloud.error = error && error.message ? error.message : 'Anmeldung ist nicht erreichbar.';
  globalThis.dispatchEvent(new Event('cloud:ready'));
});

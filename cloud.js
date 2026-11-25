const config = globalThis.AppConfig || {};
const url = typeof config.SUPABASE_URL === 'string' ? config.SUPABASE_URL.trim() : '';
const anonKey = typeof config.SUPABASE_ANON_KEY === 'string' ? config.SUPABASE_ANON_KEY.trim() : '';
const domain = typeof config.AUTH_DOMAIN === 'string' && config.AUTH_DOMAIN.trim()
  ? config.AUTH_DOMAIN.trim()
  : 'users.invalid';
const namePattern = /^[a-z0-9_]{3,20}$/;
let warnedFilmColumns = false;

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

  function hueDistance(a, b) {
    const delta = Math.abs(a - b) % 360;
    return Math.min(delta, 360 - delta);
  }

  function avatarColor(hue, saturation, lightness) {
    const turn = ((Math.round(hue) % 360) + 360) % 360;
    return `hsl(${turn} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
  }

  function hslToHex(hue, sat, light) {
  const s = sat / 100;
  const l = light / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * value).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function nextWishColor() {
  const hue = Math.random() * 360;
  const sat = 85 + Math.random() * 15;
  const light = 50 + Math.random() * 10;
  return hslToHex(hue, sat, light);
}

function randomAvatar() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const wrap = (hue) => ((hue % 360) + 360) % 360;
    const pick = (min, max) => min + Math.random() * (max - min);
    const families = [[28, 48], [290, 335], [255, 280], [180, 200]];
    const family = families[Math.floor(Math.random() * families.length)];
    const core = pick(family[0], family[1]);
    const mid = wrap(core + dir * pick(30, 70));
    const under = wrap(mid + dir * pick(20, 40));
    let outer = wrap(under + 180);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const hue = Math.random() * 360;
      if (hueDistance(hue, mid) >= 70 && hueDistance(hue, under) >= 70 && hueDistance(hue, core) >= 40) {
        outer = hue;
        break;
      }
    }
    const patterns = [
      [[70, 100, 90, 96], [80, 95, 55, 62], [60, 80, 38, 46], [85, 100, 68, 76]],
      [[60, 85, 30, 38], [80, 95, 55, 62], [70, 100, 82, 90], [70, 90, 40, 48]],
      [[90, 100, 56, 62], [75, 90, 48, 56], [55, 75, 28, 36], [85, 100, 74, 82]],
      [[90, 100, 56, 62], [80, 95, 66, 72], [70, 100, 84, 92], [60, 85, 30, 38]],
      [[85, 100, 76, 84], [85, 100, 55, 62], [60, 80, 36, 44], [90, 100, 56, 64]],
      [[60, 85, 32, 40], [85, 100, 55, 62], [80, 100, 76, 84], [90, 100, 56, 64]],
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const hues = [core, mid, under, outer];
    const sat = pattern.map((band) => pick(band[0], band[1]));
    const light = pattern.map((band) => pick(band[2], band[3]));
    const olive = (hue) => {
      const turn = wrap(hue);
      return turn >= 45 && turn <= 160;
    };
    const floorOf = (index) => (olive(hues[index]) ? 55 : 25);
    const clamp = (index, value) => Math.min(97, Math.max(floorOf(index), value));
    const separate = (i, j) => {
      let a = clamp(i, light[i]);
      let b = clamp(j, light[j]);
      if (Math.abs(a - b) >= 10) {
        light[i] = a;
        light[j] = b;
        return;
      }
      const center = (a + b) / 2;
      if (a <= b) {
        a = center - 5;
        b = center + 5;
      } else {
        a = center + 5;
        b = center - 5;
      }
      a = clamp(i, a);
      b = clamp(j, b);
      if (a <= b && b - a < 10) {
        b = Math.min(97, a + 10);
        a = Math.max(floorOf(i), b - 10);
        if (b - a < 10) b = Math.min(97, a + 10);
      } else if (a - b < 10) {
        a = Math.min(97, b + 10);
        b = Math.max(floorOf(j), a - 10);
        if (a - b < 10) a = Math.min(97, b + 10);
      }
      light[i] = clamp(i, a);
      light[j] = clamp(j, b);
    };
    for (let pass = 0; pass < 6; pass += 1) {
      for (let i = 0; i < 4; i += 1) light[i] = clamp(i, light[i]);
      separate(0, 1);
      separate(1, 2);
      separate(2, 3);
      let brightest = 0;
      let darkest = -1;
      for (let i = 0; i < 4; i += 1) {
        if (light[i] > light[brightest]) brightest = i;
        if (!olive(hues[i]) && (darkest < 0 || light[i] < light[darkest])) darkest = i;
      }
      if (light[brightest] < 75) light[brightest] = 75;
      if (Math.min(light[0], light[1], light[2], light[3]) > 46 && darkest >= 0) light[darkest] = 46;
    }
    return {
      outer: avatarColor(outer, sat[3], light[3]),
      mid: avatarColor(mid, sat[1], light[1]),
      core: avatarColor(core, sat[0], light[0]),
      under: avatarColor(under, sat[2], light[2]),
      seed: Math.floor(Math.random() * 1e9),
    };
  }

  function avatarReady(avatar) {
    return Boolean(avatar && avatar.outer && avatar.mid && avatar.core);
  }

  async function tasteRequest(method, body) {
    const session = await client.auth.getSession();
    const token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) {
      const error = new Error('Bitte zuerst anmelden.');
      error.code = 'unauthorized';
      throw error;
    }
    let response;
    try {
      response = await fetch('/api/taste', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch {
      const error = new Error('Keine Verbindung.');
      error.code = 'network';
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'taste');
      error.code = data.error || '';
      if (data.retryAt) error.retryAt = data.retryAt;
      if (data.have != null) error.have = data.have;
      throw error;
    }
    return data;
  }

  async function loadTaste(userId) {
    const { data, error } = await client.rpc('profile_taste', { uid: userId });
    if (error) {
      const missing = error.code === 'PGRST202' || /profile_taste|schema cache/i.test(error.message || '');
      if (missing) return null;
      throw error;
    }
    return data || null;
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
      let avatarKnown = true;
      let hiddenKnown = true;
      let result = await client.from('profiles')
        .select('id, username, display_name, is_private, avatar, taste_hidden')
        .eq('id', user.id)
        .single();
      if (result.error && /avatar/i.test(result.error.message || '') && !/taste_hidden/i.test(result.error.message || '')) {
        avatarKnown = false;
        result = await client.from('profiles')
          .select('id, username, display_name, is_private, taste_hidden')
          .eq('id', user.id)
          .single();
      }
      if (result.error && /taste_hidden/i.test(result.error.message || '')) {
        hiddenKnown = false;
        const columns = avatarKnown
          ? 'id, username, display_name, is_private, avatar'
          : 'id, username, display_name, is_private';
        result = await client.from('profiles').select(columns).eq('id', user.id).single();
        if (result.error && avatarKnown && /avatar/i.test(result.error.message || '')) {
          avatarKnown = false;
          result = await client.from('profiles')
            .select('id, username, display_name, is_private')
            .eq('id', user.id)
            .single();
        }
      }
      if (result.error && /avatar/i.test(result.error.message || '')) {
        avatarKnown = false;
        result = await client.from('profiles')
          .select('id, username, display_name, is_private')
          .eq('id', user.id)
          .single();
      }
      if (result.error) throw result.error;
      const taste = await loadTaste(user.id);
      return Object.assign({}, result.data, {
        avatarKnown,
        taste_hidden: hiddenKnown ? Boolean(result.data.taste_hidden) : false,
        taste,
      });
    },
    async createTaste(summary) {
      return tasteRequest('POST', summary);
    },
    async deleteTaste() {
      return tasteRequest('DELETE');
    },
    async setTasteHidden(hidden) {
      const user = await currentUser();
      const { error } = await client.from('profiles').update({ taste_hidden: Boolean(hidden) }).eq('id', user.id);
      if (error) throw error;
    },
    async tasteOf(userId) {
      return loadTaste(userId);
    },
    async ensureAvatar(row) {
      const id = (row && row.id) || (await currentUser()).id;
      const read = await client.from('profiles').select('avatar').eq('id', id).maybeSingle();
      if (read.error) throw read.error;
      if (!read.data) throw new Error('Profil fehlt.');
      if (read.data.avatar != null) return read.data.avatar;
      const avatar = randomAvatar();
      const saved = await client.from('profiles').update({ avatar }).eq('id', id).select('avatar').maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data || saved.data.avatar == null) throw new Error('Das Profilbild wurde nicht gespeichert.');
      return saved.data.avatar;
    },
    async saveAvatar(avatar) {
      if (!avatarReady(avatar)) throw new Error('Das Profilbild wurde nicht gespeichert.');
      const user = await currentUser();
      const saved = await client.from('profiles').update({ avatar }).eq('id', user.id).select('avatar').maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new Error('avatar: keine Zeile aktualisiert (RLS/Policy?)');
      const got = saved.data.avatar;
      const color = (value) => String(value == null ? '' : value).trim().toLowerCase();
      const same = got
        && typeof got === 'object'
        && color(got.outer) === color(avatar.outer)
        && color(got.mid) === color(avatar.mid)
        && color(got.core) === color(avatar.core)
        && color(got.under) === color(avatar.under)
        && Number(got.seed) === Number(avatar.seed);
      if (!same) {
        console.error('[avatar] Wert weicht ab', avatar, got);
        throw new Error('avatar: Wert weicht ab');
      }
      return got;
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
        stats: {
          films: Number(statRow && statRow.films) || 0,
          friends: statRow && statRow.friends != null ? Number(statRow.friends) : null,
        },
        sensitive: extraRow || { top_films: [], pinned_people: { actors: [], directors: [] } },
      };
    },
    rollAvatar() {
      return randomAvatar();
    },
    randomWishColor() {
      return nextWishColor();
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
        let found = await client.from('profiles').select('id, username, display_name, avatar').in('id', [...ids]);
        if (found.error && /avatar/i.test(found.error.message || '')) {
          found = await client.from('profiles').select('id, username, display_name').in('id', [...ids]);
        }
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
          avatar: person && person.avatar ? person.avatar : null,
        };
      };
      const requests = rows
        .filter((row) => row.followee === user.id && row.status === 'pending')
        .map((row) => personOf(row.follower));
      const outgoing = rows
        .filter((row) => row.follower === user.id && row.status === 'pending')
        .map((row) => personOf(row.followee));
      return {
        followers: rows.filter((row) => row.followee === user.id && row.status === 'accepted').map((row) => personOf(row.follower)),
        following: rows.filter((row) => row.follower === user.id && row.status === 'accepted').map((row) => personOf(row.followee)),
        requests,
        outgoing,
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
        .select('id, username, display_name, is_private, avatar')
        .neq('id', user.id)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(10);
      if (found.error) throw found.error;
      return (found.data || []).filter((row) => row.id !== user.id).slice(0, 10);
    },
    async profileByUsername(name) {
      const clean = normalize(name);
      if (!clean) return null;
      let result = await client.from('profiles')
        .select('id, username, display_name, is_private, avatar')
        .eq('username', clean)
        .maybeSingle();
      if (result.error && /avatar/i.test(result.error.message || '')) {
        result = await client.from('profiles')
          .select('id, username, display_name, is_private')
          .eq('username', clean)
          .maybeSingle();
      }
      if (result.error) throw result.error;
      return result.data;
    },
    async loadOther(target) {
      const user = await currentUser();
      const profileResult = await client.from('profiles')
        .select('id, username, display_name, is_private, avatar')
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
      const head = null;
      const headFilms = [];
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
        stats: {
          films: Number(statRow && statRow.films) || 0,
          friends: statRow && statRow.friends != null ? Number(statRow.friends) : null,
        },
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
    async acceptFriend(requester) {
      const { error } = await client.rpc('accept_friend', { requester });
      if (error) throw error;
    },
    async removeFriend(other) {
      const { error } = await client.rpc('remove_friend', { other });
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
      let members = await client.from('wishlist_members').select('wishlist_id, user_id, role, status, added_at');
      if (members.error && /added_at/i.test(members.error.message || '')) {
        members = await client.from('wishlist_members').select('wishlist_id, user_id, role, status');
      }
      if (members.error && /status/i.test(members.error.message || '')) {
        members = await client.from('wishlist_members').select('wishlist_id, user_id, role');
      }
      if (members.error) throw members.error;
      const rows = members.data || [];
      if (!rows.length) return [];
      const listIds = [...new Set(rows.map((row) => row.wishlist_id))];
      let lists = await client.from('wishlists').select('id, title, created_by, color').in('id', listIds);
      if (lists.error && /color/i.test(lists.error.message || '')) {
        lists = await client.from('wishlists').select('id, title, created_by').in('id', listIds);
      }
      const items = await client.from('wishlist_items').select('id, wishlist_id, film_id, status, created_at, added_by').in('wishlist_id', listIds);
      if (lists.error) throw lists.error;
      if (items.error) throw items.error;
      const peopleIds = [...new Set(rows.map((row) => row.user_id).concat((lists.data || []).map((list) => list.created_by)).filter(Boolean))];
      let people = await client.from('profiles').select('id, username, avatar').in('id', peopleIds);
      if (people.error && /avatar/i.test(people.error.message || '')) {
        people = await client.from('profiles').select('id, username').in('id', peopleIds);
      }
      if (people.error) throw people.error;
      const counted = listIds.length
        ? await client.rpc('wishlist_film_counts', { ids: listIds })
        : { data: [], error: null };
      const counts = new Map();
      if (!counted.error) {
        (counted.data || []).forEach((row) => counts.set(row.wishlist_id, Number(row.films) || 0));
      }
      const names = new Map((people.data || []).map((person) => [person.id, person.username || '']));
      const avatars = new Map((people.data || []).map((person) => [person.id, person.avatar || null]));
      return (lists.data || []).map((list) => {
        const group = rows.filter((row) => row.wishlist_id === list.id);
        const mine = group.find((row) => row.user_id === user.id);
        const listItems = (items.data || []).filter((item) => item.wishlist_id === list.id);
        const memberList = group.map((row) => ({
          id: row.user_id,
          username: names.get(row.user_id) || 'Profil',
          avatar: avatars.get(row.user_id) || null,
          role: row.role,
          status: row.status || 'accepted',
          addedAt: row.added_at || '',
        }));
        if (list.created_by && !memberList.some((person) => person.id === list.created_by)) {
          memberList.unshift({
            id: list.created_by,
            username: names.get(list.created_by) || 'Profil',
            avatar: avatars.get(list.created_by) || null,
            role: 'owner',
            status: 'accepted',
            addedAt: '',
          });
        }
        memberList.sort((a, b) => {
          const ownerA = a.role === 'owner' ? 0 : 1;
          const ownerB = b.role === 'owner' ? 0 : 1;
          if (ownerA !== ownerB) return ownerA - ownerB;
          const timeA = Date.parse(a.addedAt || '') || 0;
          const timeB = Date.parse(b.addedAt || '') || 0;
          if (timeA && timeB && timeA !== timeB) return timeA - timeB;
          return 0;
        });
        return {
          id: list.id,
          title: list.title,
          color: typeof list.color === 'string' ? list.color : '',
          createdBy: list.created_by,
          role: mine ? mine.role : 'editor',
          myStatus: mine && mine.status ? mine.status : 'accepted',
          filmCount: counts.has(list.id) ? counts.get(list.id) : listItems.length,
          members: memberList,
          openCount: listItems.filter((item) => item.status !== 'geschaut').length,
          stamps: listItems.map((item) => ({
            id: item.id,
            filmId: item.film_id,
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
      const [filmResult, votes] = await Promise.all([
        filmIds.length
          ? client.from('films').select('id, title, original_title, year, poster, kind, facets, release_date, status, checked_at').in('id', filmIds)
          : Promise.resolve({ data: [], error: null }),
        itemIds.length
          ? client.from('wishlist_votes').select('item_id, user_id').in('item_id', itemIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      let films = filmResult;
      if (films.error && /release_date|checked_at|schema cache|column/i.test(films.error.message || '')) {
        films = filmIds.length
          ? await client.from('films').select('id, title, original_title, year, poster, kind, facets').in('id', filmIds)
          : { data: [], error: null };
      }
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
    async memberRatings(userIds, filmIds) {
      const users = [...new Set((userIds || []).filter(Boolean))];
      const films = [...new Set((filmIds || []).filter(Boolean))];
      if (!users.length || !films.length) return [];
      const result = await client.from('entries')
        .select('user_id, film_id, rating')
        .in('user_id', users)
        .in('film_id', films);
      if (result.error) throw result.error;
      return (result.data || []).filter((row) => row.rating != null && Number(row.rating) > 0);
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
      let result = await client.from('films').upsert(row, { onConflict: 'id' });
      if (result.error && /release_date|checked_at|schema cache|column/i.test(result.error.message || '')) {
        if (!warnedFilmColumns) {
          warnedFilmColumns = true;
          console.warn('[upcoming] Spalten release_date/status fehlen in films – supabase/schema.sql ausführen');
        }
        const plain = { ...row };
        delete plain.release_date;
        delete plain.status;
        delete plain.checked_at;
        result = await client.from('films').upsert(plain, { onConflict: 'id' });
      }
      if (result.error) throw result.error;
    },
    async replaceCustomFilm(customId, row) {
      await this.upsertFilm(row);
      const items = await client.from('wishlist_items').select('id').eq('film_id', customId);
      if (items.error) throw items.error;
      for (const item of items.data || []) {
        const updated = await client.from('wishlist_items').update({ film_id: row.id }).eq('id', item.id);
        if (!updated.error) continue;
        const duplicate = updated.error.code === '23505' || /duplicate|wishlist_items_film_key/i.test(updated.error.message || '');
        if (!duplicate) throw updated.error;
        const removed = await client.from('wishlist_items').delete().eq('id', item.id);
        if (removed.error) throw removed.error;
      }
      const deleted = await client.from('films').delete().eq('id', customId);
      if (deleted.error) throw deleted.error;
    },
    async createWishlist(title, memberIds) {
      const user = await currentUser();
      const id = crypto.randomUUID();
      const color = nextWishColor();
      let created = await client.from('wishlists').insert({ id, title, created_by: user.id, color });
      if (created.error && /color/i.test(created.error.message || '')) {
        created = await client.from('wishlists').insert({ id, title, created_by: user.id });
      }
      if (created.error) throw created.error;
      const others = [...new Set((memberIds || []).filter((memberId) => memberId && memberId !== user.id))];
      if (others.length) {
        const inserted = await client.from('wishlist_members').insert(others.map((memberId) => ({
          wishlist_id: id,
          user_id: memberId,
          role: 'editor',
        })));
        if (inserted.error) throw inserted.error;
      }
      return id;
    },
    async renameWishlist(listId, title) {
      const { error } = await client.from('wishlists').update({ title }).eq('id', listId);
      if (error) throw error;
    },
    async setWishlistColor(listId, color) {
      const next = String(color || '').trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(next)) throw new Error('Ungültige Farbe.');
      const { error } = await client.from('wishlists').update({ color: next }).eq('id', listId);
      if (error) throw error;
    },
    async renameAccount(displayName) {
      const session = await client.auth.getSession();
      const token = session && session.data && session.data.session && session.data.session.access_token;
      if (!token) throw new Error('Bitte zuerst anmelden.');
      let response;
      try {
        response = await fetch('/api/account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'rename', name: displayName }),
        });
      } catch {
        const error = new Error('Keine Verbindung.');
        error.code = 'network';
        throw error;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || 'Das hat nicht geklappt.');
        error.code = data.code || '';
        throw error;
      }
      try { await client.auth.refreshSession(); } catch { /* die bestehende Sitzung bleibt gültig */ }
      return data;
    },
    async deleteWishlist(listId) {
      const { error } = await client.from('wishlists').delete().eq('id', listId);
      if (error) throw error;
    },
    async leaveOrDeleteWishlist(listId) {
      const { error } = await client.rpc('leave_or_delete_wishlist', { list: listId });
      if (error) throw error;
    },
    async acceptWishlist(listId) {
      const { error } = await client.rpc('accept_wishlist', { list: listId });
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

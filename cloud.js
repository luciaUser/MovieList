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
      const label = (id) => {
        const person = byId.get(id);
        if (!person) return 'Profil';
        return person.display_name || person.username || 'Profil';
      };
      return {
        followers: rows.filter((row) => row.followee === user.id && row.status === 'accepted').map((row) => label(row.follower)),
        following: rows.filter((row) => row.follower === user.id && row.status === 'accepted').map((row) => label(row.followee)),
        pending: rows.filter((row) => row.followee === user.id && row.status === 'pending').length,
      };
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

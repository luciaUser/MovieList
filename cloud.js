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
  };

  globalThis.Cloud = Cloud;
  globalThis.dispatchEvent(new Event('cloud:ready'));
}

start().catch((error) => {
  globalThis.Cloud = disabledCloud();
  globalThis.Cloud.error = error && error.message ? error.message : 'Anmeldung ist nicht erreichbar.';
  globalThis.dispatchEvent(new Event('cloud:ready'));
});

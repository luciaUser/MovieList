(function attachConfig(root) {
  const url = '';
  const anonKey = '';
  root.AppConfig = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    AUTH_DOMAIN: 'users.invalid',
    profileRequired: Boolean(url && anonKey),
  };
})(globalThis);

(function attachConfig(root) {
  const url = 'https://hbpojosygxawrndszhst.supabase.co';
  const anonKey = 'sb_publishable_nHHThBSi29qcZf2I42E8qg_UUakrTr-';
  root.AppConfig = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    AUTH_DOMAIN: 'users.invalid',
    profileRequired: Boolean(url && anonKey),
  };
  if (root.AppConfig.profileRequired && root.document && root.document.documentElement) {
    root.document.documentElement.classList.add('needs-auth');
  }
})(globalThis);

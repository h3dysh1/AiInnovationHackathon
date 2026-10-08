// Maintainer-only: export public configuration and just the two demo logins.
// No backend credentials are read or printed.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.loadEnvFile(path.join(root, '.env.local'));
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url !== 'https://vpkedekkwbzfpaseycuc.supabase.co') throw new Error('Expected the Ground Control demo project.');
let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
if (!publicKey && typeof key === 'string') {
  try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* reject non-public keys */ }
}
if (!publicKey || /[\r\n]/.test(key)) throw new Error('Only a publishable or legacy anon key can be exported.');
const logins = JSON.parse(fs.readFileSync(path.join(root, '.ground-control-demo-logins.json'), 'utf8'));
const accounts = ['mo.demo@groundcontrol.example', 'sarah.demo@groundcontrol.example'].map(email => {
  const account = logins.find(l => l.email === email);
  if (!account || typeof account.password !== 'string' || !account.password || /[\r\n`]/.test(account.password)) throw new Error('Matching demo credentials unavailable.');
  return { email, password: account.password };
});
fs.writeFileSync(path.join(root, '.env.judge.example'),
  '# Public client configuration for the shared Ground Control judging demo.\n' +
  '# Gemini and administrative keys remain on the hosted backend.\n' +
  `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`);
fs.writeFileSync(path.join(root, '.ground-control-judge-access.md'),
  '# Ground Control judge access\n\nShare this document privately with judges through the submission portal. It contains only demo account logins, not API or administrative secrets.\n\n' +
  accounts.map((a, i) => `## ${i === 0 ? 'Mo — coordinator' : 'Sarah — volunteer'}\n\nEmail: \`${a.email}\`\n\nPassword: \`${a.password}\`\n`).join('\n') +
  '\nFollow README.md to run the app. Open Riverside Live Operations - Demo in both accounts. These are shared synthetic demo accounts; changes are visible to other judges.\n', { mode: 0o600 });
fs.chmodSync(path.join(root, '.ground-control-judge-access.md'), 0o600);
console.log('Prepared .env.judge.example (public) and .ground-control-judge-access.md (private demo logins).');

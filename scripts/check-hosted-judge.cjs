// Read-only judging preflight. Uses public config and the two existing demo logins.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
process.loadEnvFile(path.join(root, '.env.judge.example'));
const logins = JSON.parse(fs.readFileSync(path.join(root, '.ground-control-demo-logins.json'), 'utf8'));
async function main() {
  const memberships = [];
  for (const [email, role] of [['mo.demo@groundcontrol.example', 'coordinator'], ['sarah.demo@groundcontrol.example', 'volunteer']]) {
    const login = logins.find(l => l.email === email);
    if (!login) throw new Error('Demo credentials unavailable.');
    const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await client.auth.signInWithPassword({ email, password: login.password });
    if (error) throw new Error('Judge demo login failed.');
    const { data: account, error: accountError } = await client.from('account_roles').select('role').eq('user_id', auth.user.id).single();
    if (accountError) throw new Error('Could not load judge account role.');
    assert.equal(account.role, role);
    const { data: profile, error: profileError } = await client.from('profiles').select('display_name').eq('id', auth.user.id).single();
    if (profileError || !profile?.display_name?.trim()) throw new Error('Judge account profile is incomplete.');
    const { data: events, error: eventsError } = await client.rpc('my_joined_events');
    if (eventsError) throw new Error('Judge event access failed.');
    memberships.push(events);
    console.log(`${role}: sign-in, profile and event access passed using the committed public configuration.`);
    await client.auth.signOut();
  }
  const shared = memberships[0].filter(e => memberships[1].some(v => v.id === e.id));
  assert.ok(shared.some(e => e.name.startsWith('Riverside Live Operations - Demo') && e.status !== 'completed'), 'No shared active live demo.');
  assert.ok(shared.some(e => e.name === 'Riverside Automatic Scheduling - Demo'), 'No shared scheduling demo.');
  console.log('Both judge accounts can access the documented Riverside live and scheduling scenarios.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

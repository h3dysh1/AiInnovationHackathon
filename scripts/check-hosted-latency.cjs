// One labelled synthetic report; preserve history and resolve it after measurement.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
process.loadEnvFile(path.join(root, '.env.local'));
const canonicalDemoId = 'd0000000-0000-4000-8000-000000000001';
const logins = JSON.parse(fs.readFileSync(path.join(root, '.ground-control-demo-logins.json'), 'utf8'));
async function user(email) {
  const login = logins.find(l => l.email === email);
  if (!login) throw new Error('Demo credentials unavailable.');
  const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: login.password });
  if (error) throw new Error('Demo login failed.');
  return client;
}
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.code}`);
  return data;
}
async function main() {
  const sarah = await user('sarah.demo@groundcontrol.example');
  const mo = await user('mo.demo@groundcontrol.example');
  const { data: events, error } = await mo.from('events').select('id,name,is_demo,status')
    .or(`is_demo.eq.true,id.eq.${canonicalDemoId}`);
  if (error) throw new Error(`Demo event lookup failed: ${error.code}; no report created.`);
  const memberships = await rpc(sarah, 'my_joined_events', {});
  const event = events.filter(e => /^Riverside/i.test(e.name) && e.status !== 'completed' && memberships.some(m => m.id === e.id))
    .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'))[0];
  if (!event) throw new Error('Shared Riverside demo event unavailable; no report created.');
  const eventId = event.id;
  const raw = '[DEMO LATENCY TEST] Routine radio test at Water Station B. No assistance requested.';
  const started = performance.now();
  const incident = await rpc(sarah, 'report_incident', { p_event_id: eventId, p_raw_report: raw, p_request_id: crypto.randomUUID() });
  console.log(`Report receipt: ${Math.round(performance.now() - started)} ms.`);
  try {
    for (let n = 0; n < 35; n++) {
      const { data, error } = await mo.from('incidents').select('raw_report,summary,processing_status,processing_error').eq('id', incident.id).single();
      if (error) throw new Error('Coordinator could not read the saved original.');
      assert.equal(data.raw_report, raw);
      if (data.summary || data.processing_status === 'failed') {
        console.log(`First AI outcome: ${Math.round(performance.now() - started)} ms; ${data.summary ? 'interpretation available' : 'failure surfaced; original available for human review'}.`);
        if (!data.summary) console.log(`Deadline surfaced: ${Boolean(data.processing_error?.includes('AI analysis delayed'))}.`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('No interpretation or failure surfaced within 35 seconds; worker queue latency remains unresolved.');
  } finally {
    await rpc(mo, 'resolve_incident', { p_id: incident.id, p_notes: 'Synthetic latency check finished. No operational incident. Original and processing history retained.' });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

// Run with: node --experimental-strip-types scripts/seed-demo.ts
/// <reference types="node" />
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { demo, certificatePdf, demoSql } from './demo-fixture.ts';

const root = resolve(import.meta.dirname, '..');
const loginFile = resolve(root, '.ground-control-demo-logins.json');
type Login = { email: string; password: string; userId: string };

async function main() {
  for (const file of ['.env.local', '.ground-control-backend-secrets']) {
    const path = resolve(root, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Demo not created: SUPABASE_ACCESS_TOKEN is unavailable. Public client credentials cannot create confirmed accounts or seed privileged records.');
  const url = `https://${demo.projectRef}.supabase.co`;
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== url) throw new Error('Refusing to seed a different Supabase project.');
  async function management(endpoint: string, body?: object): Promise<unknown> {
    const response = await fetch(`https://api.supabase.com/v1/projects/${demo.projectRef}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000),
    });
    // Do not print server bodies: they can contain credentials or SQL.
    if (!response.ok) throw new Error(`Supabase ${endpoint} failed (HTTP ${response.status}). Existing demo data is retained.`);
    return response.json();
  }
  const query = (sql: string) => management('/database/query', { query: sql });
  const prerequisites = await query("select to_regprocedure('public.publish_roster(uuid,bigint,bigint)') is not null as ready") as { ready: boolean }[];
  if (!prerequisites[0]?.ready) throw new Error('Demo requires existing migrations 001-014. No records created.');
  const existing = await query(`select created_by from public.events where id='${demo.eventId}'`) as { created_by: string }[];
  if (existing.length) {
    console.log(`Existing Riverside demo retained. Join code: ${demo.joinCode}. Local login file: ${existsSync(loginFile) ? loginFile : 'unavailable; passwords are not reset'}.`);
    return;
  }
  const keys = await management('/api-keys') as { name: string; api_key: string }[];
  const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
  if (!serviceKey) throw new Error('Supabase service-role access is unavailable; demo accounts were not created.');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const logins: Login[] = existsSync(loginFile) ? JSON.parse(readFileSync(loginFile, 'utf8')) as Login[] : [];
  for (const account of demo.accounts) {
    let found: { id: string; app_metadata: Record<string, unknown> } | undefined;
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error('Could not check existing demo accounts.');
      found = data.users.find(user => user.email === account.email);
      if (found || data.users.length < 1000) break;
    }
    if (found) {
      if (found.app_metadata.ground_control_demo !== 'riverside-v1' || !logins.some(login => login.userId === found?.id && login.email === account.email)) {
        throw new Error(`Reserved demo account ${account.email} exists without matching local demo credentials. It was not modified.`);
      }
      continue;
    }
    const password = `GCdemo-${randomBytes(18).toString('base64url')}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email, password, email_confirm: true,
      user_metadata: { display_name: account.name },
      app_metadata: { ground_control_demo: 'riverside-v1' },
    });
    if (error || !data.user) throw new Error(`Could not create ${account.email}. Existing accounts and local credentials are retained for retry.`);
    logins.push({ email: account.email, password, userId: data.user.id });
    writeFileSync(loginFile, JSON.stringify(logins, null, 2) + '\n', { mode: 0o600 });
  }
  const ids = demo.accounts.map(account => {
    const login = logins.find(entry => entry.email === account.email);
    if (!login) throw new Error('Missing demo login.');
    return login.userId;
  });
  const pdf = certificatePdf();
  const path = `${ids[1]}/${demo.certificateId}/demo-first-aid.pdf`;
  const bucket = admin.storage.from('certificates');
  const { data: original } = await bucket.download(path);
  if (!original) {
    const { error } = await bucket.upload(path, pdf, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error('Could not upload the synthetic certificate. Accounts and login file are retained for retry.');
  } else if (!Buffer.from(await original.arrayBuffer()).equals(pdf)) {
    throw new Error('An existing certificate differs from the demo fixture; it was not overwritten.');
  }
  await query(demoSql(ids, pdf.length));
  // Confirm the same user-facing access used by the application.
  for (const index of [0, 1]) {
    const login = logins.find(entry => entry.userId === ids[index])!;
    const client = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword(login);
    if (error) throw new Error('Demo created, but login verification failed. Records and local credentials are retained.');
    const { error: accessError } = await client.rpc(index === 0 ? 'get_event_readiness' : 'my_event_schedule', { p_event_id: demo.eventId });
    if (accessError) throw new Error('Demo created, but role access verification failed. Records are retained.');
  }
  console.log(`Created Riverside 2026 - Demo (${demo.joinCode}): Mo, Sarah, three supporting volunteers, private synthetic First Aid certificate, availability and a published roster. Logins: ${loginFile}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Demo setup failed.');
  process.exitCode = 1;
});

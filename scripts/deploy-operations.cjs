// Scope is fixed to Ground Control; this deploys no AI provider code or secrets.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ref = 'vpkedekkwbzfpaseycuc';
for (const file of ['.env.local', '.ground-control-backend-secrets']) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}
async function api(endpoint, body, method = 'POST') {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Ground Control ${endpoint}: HTTP ${response.status}. No credentials or response bodies logged.`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN unavailable. No hosted changes made.');
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('Ground Control project mismatch. No changes made.');
  const cli = process.env.GROUND_CONTROL_SUPABASE_CLI || '/Users/jakespaul/.npm/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-darwin-arm64/bin/supabase';
  if (!fs.existsSync(cli)) throw new Error('Supabase CLI unavailable. No hosted changes made.');
  const check = await api('/database/query', { query: `select
    to_regprocedure('public.live_candidate_problem(uuid,uuid,jsonb)') is not null as live_ready,
    to_regprocedure('public.advance_incident_intelligence(uuid,integer,text,jsonb,jsonb,jsonb,text,text)') is not null as stages_ready,
    to_regclass('vault.decrypted_secrets') is not null as vault,
    to_regnamespace('cron') is not null as cron` });
  if (!Object.values(check[0] ?? {}).every(Boolean)) throw new Error('Required deployed schema is unavailable. No migrations applied.');
  for (const name of ['202610080029_operational_notifications.sql', '202610080030_external_signals.sql', '202610080031_roster_rest_rules.sql', '202610080034_certificate_attention.sql']) {
    await api('/database/query', { query: fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8') });
    console.log(`Applied ${name}.`);
  }
  for (const name of ['operations-worker', 'roster-generate']) {
    const result = spawnSync(cli, ['functions', 'deploy', name, '--project-ref', ref, '--use-api', '--no-verify-jwt', '--yes'], {
      cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.error || result.status !== 0) throw new Error(`${name} deployment failed. Saved operational records retained.`);
  }
  const result = await api('/database/query', { query: `select
    exists(select 1 from cron.job where jobname='ground-control-operations' and active) as scheduled,
    not has_table_privilege('authenticated','public.push_deliveries','select') as deliveries_private,
    not has_table_privilege('authenticated','public.push_devices','select') as devices_private,
    not has_function_privilege('authenticated','public.claim_push_deliveries()','execute') as claims_private,
    not has_function_privilege('authenticated','public.consume_operations_wakeup(uuid)','execute') as tickets_private,
    not has_function_privilege('authenticated','public.finish_weather_update(uuid,integer,jsonb,text)','execute') as weather_private` });
  if (!Object.values(result[0] ?? {}).every(Boolean)) throw new Error('Operations activation privacy verification failed.');
  await api('/database/query', { query: 'select public.wake_operations_worker()' });
  fs.mkdirSync(path.join(root, 'docs/functionality'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/functionality/operations-deployment.json'), JSON.stringify({ checkedAt: new Date().toISOString(), project: ref, verified: result[0], functions: ['operations-worker', 'roster-generate'], aiProviderChanges: false }, null, 2));
  console.log('Ground Control operations worker, notification privacy and schedule verified. No AI code or secrets changed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

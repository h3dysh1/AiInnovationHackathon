// Ground Control only. Credentials never appear in logs or CLI arguments.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ref = 'vpkedekkwbzfpaseycuc';
const url = `https://${ref}.supabase.co`;
for (const file of ['.env.local', '.ground-control-backend-secrets']) {
  const filename = path.join(root, file);
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
async function api(endpoint, body, method = 'POST') {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Supabase ${endpoint}: HTTP ${response.status}. No credentials or response body logged.`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const sqlLiteral = value => "'" + value.replaceAll("'", "''") + "'";
async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN unavailable; no hosted changes made.');
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== url) throw new Error('Client project URL does not match Ground Control.');
  const cli = process.env.GROUND_CONTROL_SUPABASE_CLI ||
    '/Users/jakespaul/.npm/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-darwin-arm64/bin/supabase';
  if (!fs.existsSync(cli)) throw new Error('Supabase CLI unavailable; set GROUND_CONTROL_SUPABASE_CLI to its installed path.');
  const secretNames = (await api('/secrets', undefined, 'GET')).map(secret => secret.name);
  if (!secretNames.includes('GEMINI_API_KEY')) throw new Error('Hosted GEMINI_API_KEY unavailable; no hosted changes made.');
  // Latency/adapter updates do not require reapplying historical migrations.
  if (process.argv.includes('--worker-only')) {
    const deployed = spawnSync(cli, ['functions', 'deploy', 'incident-ai', '--project-ref', ref,
      '--use-api', '--no-verify-jwt', '--yes'], { cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    if (deployed.error || deployed.status !== 0) throw new Error('Worker deployment failed. Saved reports remain available.');
    console.log('Deployed incident worker only; database migrations unchanged.');
    return;
  }
  const preflight = await api('/database/query', { query: `select
    to_regprocedure('public.report_voice_incident(uuid,text,text,integer,uuid)') is not null
      or to_regprocedure('public.report_voice_incident(uuid,text,text,integer,uuid,text,uuid)') is not null as ready,
    exists(select 1 from pg_available_extensions where name='pg_net') as net,
    exists(select 1 from pg_available_extensions where name='pg_cron') as cron,
    to_regclass('vault.decrypted_secrets') is not null as vault` });
  if (!preflight[0]?.ready || !preflight[0]?.net || !preflight[0]?.cron || !preflight[0]?.vault) {
    throw new Error('Required incident schema, pg_net, pg_cron or Vault unavailable. No migration applied.');
  }
  // Install the core RPCs before deploying the worker, then activate network wakeups.
  await api('/database/query', { query: fs.readFileSync(path.join(root, 'supabase/migrations/202610070020_incident_reliability.sql'), 'utf8') });
  console.log('Applied incident reliability migration 020.');
  for(const file of ['202610080022_event_operations.sql','202610080023_live_intelligence.sql','202610080024_live_response.sql','202610080025_operations_completion.sql','202610080026_intelligence_stages.sql','202610080027_event_briefing.sql','202610080028_restart_demo.sql']) {
    await api('/database/query',{query:fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8')});
    console.log(`Applied ${file}.`);
  }
  const deployed = spawnSync(cli, ['functions', 'deploy', 'incident-ai', '--project-ref', ref,
    '--use-api', '--no-verify-jwt', '--yes'], { cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
  if (deployed.error || deployed.status !== 0) throw new Error('Worker deployment failed. Reports remain saved and queued; rerun to recover.');
  const vaultQuery = Object.entries({ ground_control_project_url: url }).map(([name, value]) => `
    do $vault$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name=${sqlLiteral(name)} limit 1;
      if v_id is null then perform vault.create_secret(${sqlLiteral(value)},${sqlLiteral(name)});
      else perform vault.update_secret(v_id,${sqlLiteral(value)},${sqlLiteral(name)}); end if;
    end $vault$;`).join('\n');
  await api('/database/query', { query: vaultQuery });
  await api('/database/query', { query: fs.readFileSync(path.join(root, 'supabase/migrations/202610070021_incident_worker_schedule.sql'), 'utf8') });
  await api('/database/query',{query:fs.readFileSync(path.join(root,'supabase/migrations/202610080025_operations_completion.sql'),'utf8')});
  const verified = await api('/database/query', { query: `select
    exists(select 1 from cron.job where jobname='ground-control-incident-processing' and active) as scheduled,
    exists(select 1 from pg_extension where extname='pg_net') as network,
    exists(select 1 from vault.secrets where name='ground_control_project_url') as configured,
    not has_table_privilege('authenticated','vault.decrypted_secrets','select') as vault_private,
    not has_table_privilege('authenticated','public.incident_worker_wakeups','select') as tickets_private,
    not has_function_privilege('authenticated','public.consume_incident_wakeup(uuid)','execute') as ticket_consumption_private,
    not has_function_privilege('authenticated','public.claim_incident_processing(uuid)','execute') as claim_private,
    not has_function_privilege('authenticated','public.finish_incident_processing(uuid,integer,text,text)','execute') as completion_private` });
  if (!Object.values(verified[0] ?? {}).every(Boolean)) throw new Error('Incident worker activation could not be verified. Reports retained.');
  await api('/database/query', { query: 'select public.wake_incident_worker()' });
  console.log('Deployed incident worker; single-use wakeup tickets and one-minute recovery schedule verified.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

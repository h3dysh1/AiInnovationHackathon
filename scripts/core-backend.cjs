// Ground Control only. Never log credentials or private uploaded content.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const file of ['.env.local', '.ground-control-backend-secrets']) {
  if (fs.existsSync(path.join(root, file))) process.loadEnvFile(path.join(root, file));
}
const ref = 'vpkedekkwbzfpaseycuc';
async function api(endpoint, body) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw Error('SUPABASE_ACCESS_TOKEN unavailable.');
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw Error(`Ground Control backend HTTP ${response.status}.`);
  return response.json();
}
const query = sql => api('/database/query', { query: sql });
async function main() {
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) throw Error('Unexpected project.');
  if (process.argv[2] === 'deploy') {
    const file = '202610080032_setup_map_recovery.sql';
    await query(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    console.log(`Applied ${file}.`);
    const cli = process.env.GROUND_CONTROL_SUPABASE_CLI || '/Users/jakespaul/.npm/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-darwin-arm64/bin/supabase';
    const result = spawnSync(cli, ['functions', 'deploy', 'setup-ai', '--project-ref', ref, '--use-api', '--no-verify-jwt', '--yes'], { cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    if (result.error || result.status !== 0) throw Error('Setup deployment failed; originals retained.');
  } else if (process.argv[2] !== 'status') throw Error('Use status or deploy.');
  console.log(JSON.stringify(await query(`select
    to_regprocedure('public.recover_setup_jobs()') is not null as setup_recovery,
    exists(select 1 from cron.job where jobname='ground-control-setup-recovery' and active) as recovery_scheduled,
    exists(select 1 from cron.job where jobname='ground-control-incident-processing' and active) as attendance_scheduled;
    select status,count(*) from public.setup_ai_jobs group by status;
    select id,status,attempt,error_message from public.setup_ai_jobs where status in ('running','failed') order by updated_at desc limit 3;`), null, 2));
  const functions = await api('/functions');
  console.log(JSON.stringify(functions.filter(f => ['setup-ai','roster-generate','incident-ai'].includes(f.slug)).map(({slug,status,version}) => ({slug,status,version})), null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

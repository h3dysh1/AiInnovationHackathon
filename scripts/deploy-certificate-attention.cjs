// Apply only the certificate review/attention change to Ground Control.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ref = 'vpkedekkwbzfpaseycuc';
for (const file of ['.env.local', '.ground-control-backend-secrets']) {
  const filename = path.join(root, file);
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Ground Control database: HTTP ${response.status}. No credentials or response bodies logged.`);
  return response.json();
}
(async () => {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN unavailable. No hosted changes made.');
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('Ground Control project mismatch. No hosted changes made.');
  const preflight = await query("select to_regprocedure('public.notify_event_managers(uuid,text,uuid,text,text,text,boolean)') is not null as notifications, to_regclass('public.certification_history') is not null as history");
  if (!preflight[0]?.history) throw new Error('Certificate history unavailable. No hosted changes made.');
  if (!preflight[0]?.notifications) {
    const dependency = await query("select to_regclass('public.incidents') is not null and to_regclass('public.risk_alerts') is not null and to_regclass('public.dispatch_requests') is not null and to_regclass('public.response_plans') is not null and to_regclass('public.rosters') is not null as ready");
    if (!dependency[0]?.ready) throw new Error('Notification prerequisites unavailable. No hosted changes made.');
    await query(fs.readFileSync(path.join(root, 'supabase/migrations/202610080029_operational_notifications.sql'), 'utf8'));
    console.log('Applied existing operational notification dependency.');
  }
  await query(fs.readFileSync(path.join(root, 'supabase/migrations/202610080034_certificate_attention.sql'), 'utf8'));
  const verified = await query(`select
    not has_function_privilege('authenticated','public.refresh_certificate_attention(uuid,uuid)','execute') as flags_private,
    not has_table_privilege('authenticated','public.certificate_attention_state','select') as state_private,
    not exists(select 1 from public.certifications where status in ('verified','expired') and reviewed_at is null) as human_approval_required,
    exists(select 1 from pg_trigger where tgname='certificate_attention_certificate' and not tgisinternal) as certificate_trigger,
    exists(select 1 from pg_trigger where tgname='certificate_attention_event' and not tgisinternal) as event_trigger,
    exists(select 1 from pg_trigger where tgname='certificate_attention_membership' and not tgisinternal) as membership_trigger`);
  if (!Object.values(verified[0] ?? {}).every(Boolean)) throw new Error('Certificate attention deployment verification failed. Evidence retained.');
  console.log('Ground Control certificate attention migration applied; human review requirement, triggers and privacy verified.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

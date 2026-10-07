// Non-interactive deployment, scoped to Ground Control's existing project.
// Secrets are passed in HTTPS bodies/headers or child-process environment only.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const projectRef = 'vpkedekkwbzfpaseycuc';
for (const file of ['.env.local', '.ground-control-backend-secrets']) {
  const filename = path.join(root, file);
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
async function management(endpoint, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    // Never print response bodies that might include query text or credentials.
    throw new Error(
      `Supabase ${endpoint} failed (HTTP ${response.status}). Previously committed migrations are retained and can be rerun.`,
    );
  }
  if (response.status === 204) return null;
  const payload = await response.text();
  return payload ? JSON.parse(payload) : null;
}
async function main() {
  const missing = ['SUPABASE_ACCESS_TOKEN', 'GEMINI_API_KEY'].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(
      `Deployment unavailable: ${missing.join(', ')} not configured. No remote changes made.`,
    );
    process.exitCode = 2;
    return;
  }
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (configured && new URL(configured).hostname !== `${projectRef}.supabase.co`) {
    throw new Error('Public client points to a different Supabase project. Deployment refused.');
  }
  const prerequisites = await management('/database/query', {
    query:
      `select to_regprocedure('public.save_location_post(uuid,text,uuid,text,boolean,text,text,numeric,numeric,numeric,uuid,numeric,numeric,numeric)') is not null as ready`,
  });
  if (!prerequisites?.[0]?.ready) {
    throw new Error(
      'Existing migrations 001–008 are required before this deployment. No changes made.',
    );
  }
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((file) =>
    /^2026100700(09|10|11|12|13|14)_.*\.sql$/.test(file)
  ).sort();
  if (migrations.length !== 6) {
    throw new Error('Expected the six reviewed setup and staffing migrations.');
  }
  for (const file of migrations) {
    await management('/database/query', {
      query: fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'),
    });
    console.log(`Applied ${file}`);
  }
  await management('/secrets', [
    { name: 'AI_PROVIDER', value: process.env.AI_PROVIDER || 'gemini' },
    { name: 'GEMINI_MODEL', value: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' },
    { name: 'GEMINI_API_KEY', value: process.env.GEMINI_API_KEY },
  ]);
  for (const name of ['setup-ai', 'certificate-ai', 'roster-generate']) {
    const result = spawnSync('npx', [
      '--yes',
      'supabase',
      'functions',
      'deploy',
      name,
      '--project-ref',
      projectRef,
      '--use-api',
      '--yes',
    ], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        `${name} deployment failed. Database migrations, secrets and any earlier functions are retained; rerun this helper to retry.`,
      );
    }
    console.log(`Deployed ${name}`);
  }
  console.log(
    'Ground Control migrations and all three Edge Functions deployed. Live provider/device acceptance is still required.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

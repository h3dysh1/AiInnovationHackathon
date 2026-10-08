const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path=require('node:path');
const root = path.resolve(__dirname,'..');
const { createClient } = require(`${root}/node_modules/@supabase/supabase-js`);
process.loadEnvFile(`${root}/.env.local`);
const logins = JSON.parse(fs.readFileSync(`${root}/.ground-control-demo-logins.json`, 'utf8'));
const eventId = 'd0000000-0000-4000-8000-000000000001';
const client = () => createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
async function rpc(c, name, args) {
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.code}`);
  return data;
}
async function main() {
  const sarah = client(), mo = client(), other = client();
  for (const [c, email] of [[sarah, 'sarah.demo@groundcontrol.example'], [mo, 'mo.demo@groundcontrol.example'],
    [other, logins[2].email]]) {
    const login = logins.find(l => l.email === email);
    const { error } = await c.auth.signInWithPassword({ email: login.email, password: login.password });
    if (error) throw new Error('Demo login failed.');
  }
  const requestId = crypto.randomUUID();
  const raw = '[DEMO TEST] Routine radio test at Water Station B. No assistance requested.';
  const first = await rpc(sarah, 'report_incident', { p_event_id: eventId, p_raw_report: raw, p_request_id: requestId });
  const repeated = await rpc(sarah, 'report_incident', { p_event_id: eventId, p_raw_report: raw, p_request_id: requestId });
  assert.equal(first.id, repeated.id);
  const denied = await other.rpc('retry_incident_processing', { p_id: first.id });
  assert.ok(denied.error, 'Other volunteers cannot retry Sarah reports');
  console.log('Hosted receipt confirmed and repeat request returned the same report.');
  async function wait(id, voice) {
    for (let n = 0; n < 120; n++) {
      const { data, error } = await sarah.from('incidents').select('raw_report,transcript,processing_status,processing_error,status').eq('id', id).single();
      if (error) throw new Error('Could not read saved report.');
      if (data.processing_status === 'complete') {
        if (voice) assert.ok(data.transcript?.trim());
        console.log(voice ? 'Hosted Gemini transcription completed; original context and audio retained.' : 'Hosted text processing completed without a client analysis request.');
        return data;
      }
      if (data.processing_status === 'failed') {
        if(n%10===0)console.log('Hosted AI retry pending; saved evidence retained.');
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('Hosted queue did not complete within acceptance window; labelled report retained.');
  }
  assert.equal((await wait(first.id, false)).raw_report, raw);
  await rpc(mo, 'resolve_incident', { p_id: first.id, p_notes: 'Automated demo acceptance test completed. No operational incident.' });
  const voiceId = crypto.randomUUID();
  const sarahLogin = logins.find(l => l.email === 'sarah.demo@groundcontrol.example');
  const audioPath = `${sarahLogin.userId}/${eventId}/${voiceId}.m4a`;
  const audio = fs.readFileSync(`${root}/demo/radio-test.m4a`);
  const { error: uploadError } = await sarah.storage.from('incident-audio').upload(audioPath, audio, { contentType: 'audio/mp4', upsert: false });
  if (uploadError) throw new Error(`Test audio upload failed: ${uploadError.statusCode}`);
  const context = '[DEMO TEST] Synthetic audio acceptance test. No operational assistance requested.';
  const voice = await rpc(sarah, 'report_voice_incident', { p_event_id: eventId, p_audio_path: audioPath,
    p_audio_mime_type: 'audio/mp4', p_audio_size_bytes: audio.length, p_written_context: context, p_request_id: voiceId });
  const voiceRepeat = await rpc(sarah, 'report_voice_incident', { p_event_id: eventId, p_audio_path: audioPath,
    p_audio_mime_type: 'audio/mp4', p_audio_size_bytes: audio.length, p_written_context: context, p_request_id: voiceId });
  assert.equal(voice.id, voiceRepeat.id);
  const result = await wait(voice.id, true);
  assert.equal(result.raw_report, context);
  const { data: original, error: audioError } = await sarah.storage.from('incident-audio').download(audioPath);
  assert.equal(audioError, null);
  assert.ok(Buffer.from(await original.arrayBuffer()).equals(audio));
  await rpc(mo, 'resolve_incident', { p_id: voice.id, p_notes: 'Synthetic voice/Gemini acceptance test completed. No operational incident.' });
  console.log('Hosted checks passed; two clearly labelled demo test reports resolved with history preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

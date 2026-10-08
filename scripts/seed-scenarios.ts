/// <reference types="node" />
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {demo,certificatePdf} from './demo-fixture.ts';
import {reserveAccounts,scenarioSql,liveDemoId,rosterDemoId} from './live-demo-fixture.ts';
type Login={email:string;password:string;userId:string};
const root=resolve(import.meta.dirname,'..');
async function main(){
 for(const file of ['.env.local','.ground-control-backend-secrets'])if(existsSync(resolve(root,file)))process.loadEnvFile(resolve(root,file));
 const url=`https://${demo.projectRef}.supabase.co`;
 if(process.env.EXPO_PUBLIC_SUPABASE_URL!==url||!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Ground Control project credentials unavailable.');
 async function api(endpoint:string,body?:object){const r=await fetch(`https://api.supabase.com/v1/projects/${demo.projectRef}${endpoint}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`Ground Control request failed: HTTP ${r.status}; existing data retained.`);return r.json();}
 const keys=await api('/api-keys') as {name:string;api_key:string}[];
 const key=keys.find(k=>k.name==='service_role')?.api_key;
 if(!key)throw new Error('Ground Control service access unavailable.');
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const path=resolve(root,'.ground-control-demo-logins.json');
 const logins=JSON.parse(readFileSync(path,'utf8')) as Login[];
 const {data:users,error}=await admin.auth.admin.listUsers({perPage:1000});if(error)throw new Error('Demo account lookup failed.');
 for(const account of reserveAccounts){
  const found=users.users.find(u=>u.email===account.email);
  if(found){if(!logins.some(l=>l.userId===found.id)||found.app_metadata.ground_control_demo!=='riverside-v1')throw new Error('Reserved demo account cannot be modified.');continue;}
  const password=`GCdemo-${randomBytes(18).toString('base64url')}!`;
  const {data,error}=await admin.auth.admin.createUser({email:account.email,password,email_confirm:true,user_metadata:{display_name:account.name},app_metadata:{ground_control_demo:'riverside-v1'}});
  if(error||!data.user)throw new Error('Reserve demo account could not be created.');
  logins.push({email:account.email,password,userId:data.user.id});writeFileSync(path,JSON.stringify(logins,null,2)+'\n',{mode:0o600});
 }
 const ids=[...demo.accounts,...reserveAccounts].map(a=>{const l=logins.find(l=>l.email===a.email);if(!l)throw new Error('Demo login unavailable.');return l.userId;});
 for(const live of [false,true])await api('/database/query',{query:scenarioSql(ids,live)});
 const certificates=await api('/database/query',{query:`select c.storage_path,p.display_name from public.certifications c join public.profiles p on p.id=c.user_id where c.title='SYNTHETIC DEMO qualification' and c.user_id in (${ids.slice(1).map(id=>`'${id}'::uuid`).join(',')})`}) as {storage_path:string;display_name:string}[];
 for(const c of certificates){const {data}=await admin.storage.from('certificates').download(c.storage_path);if(!data){const {error}=await admin.storage.from('certificates').upload(c.storage_path,certificatePdf(c.display_name),{contentType:'application/pdf',upsert:false});if(error)throw new Error('Synthetic certificate file could not be uploaded.');}}
 console.log(`Prepared scheduling scenario ${rosterDemoId} (RIVERROSTER) and live scenario ${liveDemoId} (RIVERLIVE). Existing scenarios and decisions retained. Passwords remain in the ignored local login file.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

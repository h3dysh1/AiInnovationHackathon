// Judge setup uses public client configuration only. Never overwrites local settings.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env.local');
if (fs.existsSync(target)) {
  console.log('Existing .env.local retained. Start with npm start, or npm run web.');
} else {
  fs.copyFileSync(path.join(root, '.env.judge.example'), target, fs.constants.COPYFILE_EXCL);
  console.log('Configured the hosted Ground Control demo using public Supabase settings.');
  console.log('Start with npm start, or npm run web. Use the demo logins supplied with the submission.');
}

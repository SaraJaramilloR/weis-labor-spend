// Sets the demo access password locally WITHOUT storing it: prompts twice (hidden input), then writes only the
// salted SHA-256 hash to .env.local as VITE_ACCESS_PASSWORD_HASH (.env.local is ignored by Git and Vercel).
// The hash is embedded in the public bundle at build time: it is NOT a secret. Use a long, unique passphrase.
// Usage: npm run set-access-password
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';

const SALT = 'weis-bc5-demo-gate:v1:'; // must match src/lib/accessGate.ts
const FILE = new URL('../.env.local', import.meta.url);

function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({input: process.stdin, output: process.stdout, terminal: true});
    rl._writeToOutput = s => {
      if (s.includes(question)) process.stdout.write(question);
    };
    rl.question(question, answer => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const first = await ask('New demo access password (hidden): ');
const second = await ask('Repeat the password (hidden): ');
if (first !== second) {
  console.error('The passwords do not match. Nothing was changed.');
  process.exit(1);
}
if (first.length < 12 || first.length > 200) {
  console.error('Use 12 to 200 characters (a long passphrase is recommended). Nothing was changed.');
  process.exit(1);
}
const hash = createHash('sha256').update(SALT + first).digest('hex');
const lines = existsSync(FILE) ? readFileSync(FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('VITE_ACCESS_PASSWORD_HASH=')) : [];
lines.push(`VITE_ACCESS_PASSWORD_HASH=${hash}`);
writeFileSync(FILE, lines.join('\n') + '\n', {mode: 0o600});
console.log('Saved the password hash to .env.local (the password itself was not stored). Restart npm run dev to use it.');

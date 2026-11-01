// `wrangler deploy` with two more tries: Cloudflare's API refuses now and then ("Unable to fetch
// bindings, routes, or services metadata from the dashboard"). After the last failure, the end of
// Wrangler's own log goes to the output: it names the API call and Cloudflare's error code and is
// sanitised by Wrangler (no token). Arguments go through to wrangler deploy.
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const TRIES=3;
for(let attempt=1;attempt<=TRIES;attempt++) {
  const {status}=spawnSync('wrangler',['deploy',...process.argv.slice(2)],{stdio:'inherit'});
  if(status===0)process.exit(0);
  console.warn(`Deploy attempt ${attempt} of ${TRIES} failed`);
  if(attempt<TRIES)await new Promise(resolve=>setTimeout(resolve,attempt*30000));
}
printWranglerLog();
process.exit(1);

/** The newest Wrangler log (Linux, macOS or WRANGLER_LOG_PATH), its last 200 lines. */
function printWranglerLog() {
  const directories=[process.env.WRANGLER_LOG_PATH,join(homedir(),'.config/.wrangler/logs'),join(homedir(),'Library/Preferences/.wrangler/logs')]
    .filter(directory=>directory&&existsSync(directory)&&statSync(directory).isDirectory());
  const logs=directories.flatMap(directory=>readdirSync(directory).filter(name=>name.endsWith('.log')).map(name=>join(directory,name)))
    .sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);
  if(!logs.length)return console.warn('No Wrangler log found.');
  console.warn(`--- ${logs[0]} (last 200 lines) ---`);
  console.warn(readFileSync(logs[0],'utf8').split('\n').slice(-200).join('\n'));
}

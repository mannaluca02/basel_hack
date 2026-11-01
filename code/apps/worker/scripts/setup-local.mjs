import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
try {
  await writeFile(new URL('../.dev.vars',import.meta.url),`LIFEMAP_STORE_KEY=${randomBytes(32).toString('base64')}\n`,{flag:'wx',mode:0o600});
  console.log('Created .dev.vars with a random local key (not printed). Keep it with your local DO state.');
}catch(error){if(error.code!=='EEXIST')throw error;console.log('.dev.vars already exists; unchanged.');}

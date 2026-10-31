import {mkdir,copyFile} from 'node:fs/promises';
// Lukas's avatar renderer for the live voice view, copied from code/avatar-prototype at start/build
// (outside the Angular workspace, so it cannot be an asset input). Generated, not committed.
const directory=new URL('../public/voice-avatar/',import.meta.url);
await mkdir(directory,{recursive:true});
await copyFile(new URL('../../../avatar-prototype/pax-avatar.js',import.meta.url),new URL('pax-avatar.js',directory));

import {mkdir,copyFile} from 'node:fs/promises';
// Debug-only generated assets; the normal web app and Dario's voice app need no copy step.
const directory=new URL('../public/voice-avatar/',import.meta.url);
await mkdir(directory,{recursive:true});
await copyFile(new URL('../../../../avatar-prototype/pax-avatar.js',import.meta.url),new URL('pax-avatar.js',directory));

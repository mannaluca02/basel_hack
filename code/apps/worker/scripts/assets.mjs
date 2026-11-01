import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadSkills,skillsPrompt} from '../../../voice-agent/skills.mjs';
import {DOCUMENTS} from '../../api/dist/insurance/products.js';
const root=new URL('../',import.meta.url);
await mkdir(new URL('generated/',root),{recursive:true});
const persona=await readFile(new URL('../../../voice-agent/persona.md',import.meta.url),'utf8');
const skills=await loadSkills(new URL('../../../voice-agent/skills/',import.meta.url).pathname);
await writeFile(new URL('generated/prompt.json',root),JSON.stringify({persona,skills,sections:Object.fromEntries(skills.map(skill=>[skill.file,skillsPrompt([skill])]))}));
const manifest={};
for(const [id,path] of Object.entries(DOCUMENTS)) {
  const source=new URL('../../../documentation/baselhack/references/products/'+path,root);
  const target=new URL('assets/_products/'+path,root);
  await mkdir(new URL('./',target),{recursive:true});await copyFile(source,target);
  manifest[id]={path:'/_products/'+path,sha256:createHash('sha256').update(await readFile(source)).digest('hex')};
}
await writeFile(new URL('generated/documents.json',root),JSON.stringify(manifest));

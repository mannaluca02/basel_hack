import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DOCUMENTS } from './products.js';
import { WorkflowError } from './types.js';

export class ProductDocuments {
  private constructor(private readonly manifest:Map<string,{id:string;sha256:string;file:URL;filename:string}>,private readonly loadBytes:(file:URL)=>Promise<Buffer>=readFile){}
  /** Empty catalog for hosts that inject assets separately. */
  static empty(){return new ProductDocuments(new Map());}
  static async load(root=new URL('../../../../../documentation/baselhack/references/products/',import.meta.url)) {
    const manifest=new Map<string,{id:string;sha256:string;file:URL;filename:string}>();
    for(const [id,path] of Object.entries(DOCUMENTS)) {
      const file=new URL(path,root);const content=await readFile(file);
      manifest.set(id,{id,file,filename:path.split('/').at(-1)!,sha256:createHash('sha256').update(content).digest('hex')});
    }
    return new ProductDocuments(manifest);
  }
  static async fromAssets(manifest:Record<string,{path:string;sha256:string}>,assets:{fetch(request:Request):Promise<Response>}) {
    const entries=new Map<string,{id:string;sha256:string;file:URL;filename:string}>();
    for(const [id,item] of Object.entries(manifest))entries.set(id,{id,sha256:item.sha256,file:new URL(item.path,'https://assets.internal'),filename:item.path.split('/').at(-1)!});
    const documents=new ProductDocuments(entries,async file=>{
      const response=await assets.fetch(new Request(file));
      if(!response.ok)throw new Error('Product asset unavailable');
      return Buffer.from(await response.arrayBuffer());
    });
    for(const id of entries.keys())await documents.read(id);
    return documents;
  }
  metadata(ids:string[]) {return [...new Set(ids)].map(id=>{const item=this.manifest.get(id);if(!item)throw new WorkflowError('DOCUMENT_NOT_FOUND',404);return {id,sha256:item.sha256,sourceStand:'archived-2026-10-30',requiresCurrentnessReview:true};});}
  async read(id:string) {
    const item=this.manifest.get(id);if(!item)throw new WorkflowError('DOCUMENT_NOT_FOUND',404);
    const bytes=await this.loadBytes(item.file);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new WorkflowError('DOCUMENT_INTEGRITY_CHANGED',409);
    return {bytes,filename:item.filename,sha256:item.sha256};
  }
}

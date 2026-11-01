import {liveAppOptions} from '../../api/dist/live-options.js';
export type WorkerConfig=Record<string,string|undefined>;
export function workerOptions(env:WorkerConfig) {
  const base=liveAppOptions(env);
  return {...base,voice:{...base.voice,resumeAfterRestart:true},http:{sameOrigin:true,logErrors:true,...(env.PAX_PUBLIC_ORIGIN?{publicOrigin:env.PAX_PUBLIC_ORIGIN}:{})},shutdownHooks:false};
}

import {liveAppOptions} from '../../api/dist/live-options.js';
export type WorkerConfig=Record<string,string|undefined>;
export function workerOptions(env:WorkerConfig) {
  return {...liveAppOptions(env),http:{sameOrigin:true,logErrors:true,...(env.PAX_PUBLIC_ORIGIN?{publicOrigin:env.PAX_PUBLIC_ORIGIN}:{})},shutdownHooks:false};
}

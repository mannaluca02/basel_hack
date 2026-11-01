/**
 * Reads a server-sent event stream by whole events, however the transport splits it: Nest first
 * sends a lone newline, which some runtimes (Node 26) deliver as its own chunk.
 */
export function sseEvents(response) {
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  return {
    reader,
    /** The next complete event (its raw text), or null once the stream ended. */
    async next() {
      for(;;) {
        const trimmed=buffer.replace(/^\n+/,'');
        const index=trimmed.indexOf('\n\n');
        if(index>=0){buffer=trimmed.slice(index+2);return trimmed.slice(0,index);}
        const chunk=await reader.read();
        if(chunk.done)return null;
        buffer+=decoder.decode(chunk.value,{stream:true});
      }
    },
    /** Events until one contains `text`, at most `limit` of them; their joined text. */
    async until(text,limit=6) {
      let seen='';
      for(let i=0;i<limit&&!seen.includes(text);i++){const event=await this.next();if(event===null)break;seen+=event+'\n\n';}
      return seen;
    },
  };
}

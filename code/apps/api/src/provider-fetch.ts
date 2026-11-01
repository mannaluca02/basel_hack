/** Server-only provider requests: never follow redirects or forward ambient credentials. */
export async function providerFetch(fetcher:typeof fetch,url:string,init:RequestInit):Promise<Response>{
  const headers=new Headers(init.headers);
  headers.delete('cookie');
  const response=await fetcher(url,{...init,headers,
    redirect:'manual',credentials:'omit'});
  // workerd rejects redirect:'error' before sending; manual preserves the same fail-closed policy.
  if(response.status>=300&&response.status<400){
    await response.body?.cancel().catch(()=>{});
    throw new Error('Provider redirect refused');
  }
  return response;
}

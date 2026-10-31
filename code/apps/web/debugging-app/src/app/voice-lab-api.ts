import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CustomerApi } from '../../../src/app/core/advisor/api/customer-api';
import { APP_ENVIRONMENT } from '../../../src/app/core/config/app-environment';

@Injectable({providedIn:'root'})
export class VoiceLabApi {
  private readonly http=inject(HttpClient);
  private readonly customer=inject(CustomerApi);
  private readonly base=inject(APP_ENVIRONMENT).apiBaseUrl;
  get<T>(path:string):Promise<T> {return firstValueFrom(this.http.get<T>(`${this.base}/${path}`));}
  caseGet<T>(path:string):Promise<T> {return this.get<T>(`cases/${this.caseId()}/${path}`);}
  post<T>(path:string,body:unknown):Promise<T> {
    return firstValueFrom(this.http.post<T>(`${this.base}/cases/${this.caseId()}/${path}`,body,
      {headers:{'X-CSRF-Token':this.customer.session()?.csrfToken??''}}));
  }
  private caseId():string {
    const id=this.customer.session()?.caseId;if(!id)throw new Error('UNAUTHORIZED');return encodeURIComponent(id);
  }
}

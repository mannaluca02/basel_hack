import { MODEL_EXTRACTION_NOTICE_VERSION,ModelExtractionConsentInputSchema,ModelExtractionNoticeSchema,ModelExtractionPermissionSchema,RevokeModelExtractionConsentSchema,
  ModelExtractionPayloadScopeSchema,ModelExtractionExclusionSchema,type ModelExtractionPermission } from '@pax/contracts';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type InsuranceCase } from './types.js';
import { sha256Json } from '../calculation/hash.js';

export type ModelExtractionOptions={enabled?:boolean};
type Locale='de'|'fr'|'it'|'en';
const texts:Record<Locale,string>={
  de:'Optionale KI-Extraktion: Damit Sie Angaben aus dem Gespräch nicht zusätzlich eintippen müssen, sendet der Prototyp nach Ihrer gesonderten Zustimmung einen kleinen, ausdrücklich erfundenen Ausschnitt an OpenAI: den Gesprächsausschnitt, eine pseudonyme Personen-ID, betroffene Feldwerte mit Einheit und Einkommensbasis, erlaubte Zielfelder und zugehörige Rückfragen. Nicht übertragen werden der vollständige Fall, Versionen und Berechtigungen, Zugangsdaten, Audio, Gesundheitsdaten oder echte Kundendaten. Das Ergebnis ist nur ein Vorschlag, den Sie prüfen und annehmen müssen. Diese Zustimmung gilt nicht für echte Daten, den Logismata-Rechner oder die Sprachdemo.',
  fr:'Extraction IA facultative : pour que vous n’ayez pas à ressaisir les informations de l’entretien, le prototype transmet à OpenAI, après votre accord séparé, un petit extrait explicitement fictif : l’extrait de conversation, un identifiant de personne pseudonyme, les valeurs concernées avec unité et base de revenu, les champs cibles autorisés et les questions de clarification associées. Ne sont pas transmis : le dossier complet, les versions et autorisations, les identifiants d’accès, l’audio, les données de santé ou des données réelles de clients. Le résultat n’est qu’une proposition que vous devez vérifier et accepter. Cet accord ne vaut ni pour des données réelles, ni pour le calculateur Logismata, ni pour la démonstration vocale.',
  it:'Estrazione IA facoltativa: per evitare di reinserire i dati della conversazione, dopo il suo consenso separato il prototipo invia a OpenAI un piccolo estratto esplicitamente fittizio: l’estratto della conversazione, un ID persona pseudonimo, i valori interessati con unità e base di reddito, i campi di destinazione consentiti e le relative domande di chiarimento. Non vengono trasmessi il caso completo, versioni e autorizzazioni, credenziali, audio, dati sanitari o dati reali di clienti. Il risultato è solo una proposta che deve verificare e accettare. Questo consenso non vale per dati reali, per il calcolatore Logismata né per la demo vocale.',
  en:'Optional AI extraction: so that you do not have to type details from the conversation again, the prototype sends a small, explicitly invented excerpt to OpenAI after your separate consent: the conversation excerpt, a pseudonymous person ID, the affected field values with unit and income basis, allowed target fields and related clarification questions. The full case, versions and permissions, credentials, audio, health data and real customer data are not sent. The result is only a proposal that you must review and accept. This consent does not cover real data, the Logismata calculator or the voice demo.',
};
const payloadScope=ModelExtractionPayloadScopeSchema.options,excluded=ModelExtractionExclusionSchema.options;
/** Any change to wording, scope or recipient yields a new hash, so a stored consent for older content no longer authorizes transfer. */
const noticeHash=sha256Json({version:MODEL_EXTRACTION_NOTICE_VERSION,provider:'openai',api:'responses',payloadScope,excluded,texts});

export class ModelExtractionConsents {
  constructor(readonly engine:LifeInsuranceEngine,readonly options:ModelExtractionOptions={}){}
  get enabled(){return this.options.enabled===true;}
  notice(locale:Locale='de'){
    return ModelExtractionNoticeSchema.parse({version:MODEL_EXTRACTION_NOTICE_VERSION,noticeHash,enabled:this.enabled,provider:'openai',api:'responses',purpose:'intake_field_extraction',
      syntheticOnly:true,separateConsentRequired:true,payloadScope,excluded,fullCaseTransferAuthorized:false,resultIsProposalOnly:true,calculatorTransferIsSeparate:true,locale,text:texts[locale]});
  }
  private evaluate(c:InsuranceCase):ModelExtractionPermission{
    const stored=c.modelExtractionConsent,consent=stored?{noticeVersion:stored.noticeVersion,noticeHash:stored.noticeHash,locale:stored.locale,acceptedAt:stored.acceptedAt}:null;
    const blockedReason=!this.enabled?'disabled':!consent?'consent_missing':consent.noticeVersion!==MODEL_EXTRACTION_NOTICE_VERSION||consent.noticeHash!==noticeHash?'notice_changed':
      c.handover.stopDigitalConversation?'human_handover_active':null;
    return ModelExtractionPermissionSchema.parse({caseId:c.id,caseRevision:c.caseRevision,enabled:this.enabled,noticeVersion:MODEL_EXTRACTION_NOTICE_VERSION,noticeHash,consent,transferAllowed:blockedReason===null,blockedReason});
  }
  private customer(actor:Actor){this.engine.sessions.assertActive(actor);if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);}
  permission(actor:Actor,id:string){
    if(actor.role==='reviewer')throw new WorkflowError('FORBIDDEN',403);
    return this.evaluate(this.engine.caseFor(actor,id,true));
  }
  /** Earnie's module calls this immediately before every model request and again before submitting its result. */
  assertTransferAllowed(actor:Actor,id:string){
    this.engine.sessions.assertActive(actor);if(actor.role!=='advisor')throw new WorkflowError('FORBIDDEN',403);
    const p=this.permission(actor,id);
    if(p.blockedReason==='human_handover_active')throw new WorkflowError('HUMAN_HANDOVER_ACTIVE');
    if(p.blockedReason==='disabled')throw new WorkflowError('MODEL_EXTRACTION_DISABLED',503);
    if(!p.transferAllowed)throw new WorkflowError('MODEL_EXTRACTION_CONSENT_REQUIRED',403);
    return p;
  }
  async consent(actor:Actor,id:string,input:unknown){
    this.customer(actor);const b=ModelExtractionConsentInputSchema.parse(input);
    if(!this.enabled)throw new WorkflowError('MODEL_EXTRACTION_DISABLED',503);
    if(b.noticeHash!==noticeHash)throw new WorkflowError('MODEL_EXTRACTION_NOTICE_CHANGED');
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      c.modelExtractionConsent={noticeVersion:b.noticeVersion,noticeHash:b.noticeHash,locale:c.locale,acceptedAt:new Date().toISOString(),acceptedBy:actor.id};
      this.engine.touch(c,'model_extraction_consent_granted');this.engine.audit(db,actor,c,'model_extraction_consent_granted');return this.evaluate(c);
    });
  }
  /** Revocation stays possible during a human handover so the customer can always withdraw. */
  async revoke(actor:Actor,id:string,input:unknown){
    this.customer(actor);const b=RevokeModelExtractionConsentSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      if(c.modelExtractionConsent){c.modelExtractionConsent=null;this.engine.touch(c,'model_extraction_consent_revoked');this.engine.audit(db,actor,c,'model_extraction_consent_revoked');}
      return this.evaluate(c);
    },{allowDuringHandover:true});
  }
}

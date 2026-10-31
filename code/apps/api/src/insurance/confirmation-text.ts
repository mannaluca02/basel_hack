import type { ConfirmationTarget,ProposalChangeInput } from '@pax/contracts';
import type { InsuranceCase } from './types.js';
import { WorkflowError } from './types.js';
import { moneyText } from './i18n.js';
const text={
 de:{profile:'Bestätigen Sie das angezeigte Gesamtprofil und seine Annahmen und erlauben Sie die Übertragung der ausdrücklich erfundenen Berechnungsdaten an den autorisierten Logismata-Hackathon-Rechner? Dies bestätigt keinen Versicherungsvertrag.',screen:'Möchten Sie alle angezeigten Änderungen gemeinsam in den Entwurf übernehmen? Das Gesamtprofil wird dadurch noch nicht bestätigt.',batch:'Möchten Sie diese Angaben gemeinsam in den Entwurf übernehmen? Das Gesamtprofil wird dadurch noch nicht bestätigt.',person:'Person',gross:'Bruttojahreseinkommen',net:'Nettoeinkommen nach Einkommenssteuer',year:'pro Jahr',month:'pro Monat'},
 fr:{profile:'Confirmez-vous le profil complet affiché et ses hypothèses et autorisez-vous le transfert des données de calcul explicitement fictives au calculateur Logismata autorisé du hackathon ? Ceci ne confirme aucun contrat d’assurance.',screen:'Voulez-vous reprendre ensemble toutes les modifications affichées dans le brouillon ? Le profil complet ne sera pas encore confirmé.',batch:'Voulez-vous reprendre ensemble ces informations dans le brouillon ? Le profil complet ne sera pas encore confirmé.',person:'Personne',gross:'Revenu annuel brut',net:'Revenu net après impôt sur le revenu',year:'par an',month:'par mois'},
 it:{profile:'Conferma il profilo completo visualizzato e le sue ipotesi e autorizza il trasferimento dei dati di calcolo esplicitamente fittizi al calcolatore Logismata autorizzato dell’hackathon? Questo non conferma un contratto assicurativo.',screen:'Vuole applicare insieme tutte le modifiche visualizzate alla bozza? Il profilo completo non sarà ancora confermato.',batch:'Vuole applicare insieme queste informazioni alla bozza? Il profilo completo non sarà ancora confermato.',person:'Persona',gross:'Reddito annuo lordo',net:'Reddito netto dopo le imposte sul reddito',year:'all’anno',month:'al mese'},
 en:{profile:'Do you confirm the complete displayed profile and its assumptions and allow the explicitly invented calculation data to be transferred to the authorised Logismata hackathon calculator? This does not confirm an insurance contract.',screen:'Would you like to apply all displayed changes to the draft together? This does not yet confirm the complete profile.',batch:'Would you like to apply these details to the draft together? This does not yet confirm the complete profile.',person:'Person',gross:'Annual gross income',net:'Net income after income tax',year:'per year',month:'per month'},
};
export function confirmationQuestion(c:InsuranceCase,target:ConfirmationTarget,channel:'voice'|'screen',changes:ProposalChangeInput[]){
 const t=text[c.locale];if(target.kind==='confirm_profile')return t.profile;if(channel==='screen')return t.screen;
 const details=changes.map(change=>{
  const gross=change.path.match(/^insurance\.persons\.(\d+)\.grossAnnualIncomeCents$/),net=change.path.match(/^financial\.persons\.(\d+)\.income\.value$/);
  const personIndex=c.draft.financial?.persons.findIndex(p=>p.id===change.personId)??-1;
  if(personIndex<0)throw new WorkflowError('VOICE_CONFIRMATION_REQUIRES_SCREEN',422);
  const personLabel=`${t.person} ${personIndex+1}`;
  if(typeof change.value!=='number')throw new WorkflowError('VOICE_CONFIRMATION_REQUIRES_SCREEN',422);
  if(gross)return `${t.gross} (${personLabel}): ${moneyText(c.locale,change.value)} ${t.year}.`;
  if(net){const person=c.draft.financial?.persons[Number(net[1])];
   if(person?.incomeBasis==='net_after_income_tax')return `${t.net} (${personLabel}): ${moneyText(c.locale,change.value)} ${person.income.period==='year'?t.year:t.month}.`;
  }
  throw new WorkflowError('VOICE_CONFIRMATION_REQUIRES_SCREEN',422);
 });
 return `${details.join(' ')} ${t.batch}`;
}

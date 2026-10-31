import type { InsuranceCaseDto } from '@pax/contracts';
import { AdvisorSnapshot, emptySnapshot } from '../advisor-data-source';

/** A projection, never a second editable case. Amounts keep their canonical cent unit. */
export function caseProjection(dto: InsuranceCaseDto) {
  const confirmed=dto.confirmedVersions.at(-1);
  return {
    caseId:dto.id,caseRevision:dto.caseRevision,contextRevision:dto.contextRevision,
    profileVersion:dto.confirmedVersions.at(-1)?.version ?? null,draftDirty:dto.draftDirty,
    pending:dto.proposalBatches.filter(batch=>batch.status==='proposed'),
    persons:(dto.draft.insurance?.persons ?? []).map(person=>({
      personId:person.personId,grossCents:person.grossAnnualIncomeCents,
      confirmedGrossCents:confirmed?.draft?.insurance?.persons.find(p=>p.personId===person.personId)?.grossAnnualIncomeCents ?? null,
      net:dto.draft.financial?.persons.find(p=>p.id===person.personId)?.income,
    })),
  };
}

export function projectCase(dto: InsuranceCaseDto): AdvisorSnapshot {
  return {...emptySnapshot(dto.id),contextRevision:dto.contextRevision,canonical:dto};
}

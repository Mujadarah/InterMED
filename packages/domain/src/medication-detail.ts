/**
 * Fail-closed error for the medication detail projection.
 *
 * Every reference of a published generation was integrity-checked at import
 * time, so within one pinned, published generation a reference that does not
 * resolve means the locally stored rows were damaged or removed. It never means
 * the source omitted the record. Reads therefore reject with this error instead
 * of dropping the row and presenting local damage as a source gap.
 *
 * The message names the entity kind of the corrupted reference. It deliberately
 * carries no product data: no name, no identifier, no field value.
 */

/** Entity kinds a detail projection resolves by reference. */
export type MedicationDetailEntityKind =
  | 'ActiveIngredient'
  | 'ATCCode'
  | 'DataSource'
  | 'DatasetVersion'
  | 'DosageForm'
  | 'Manufacturer'
  | 'MarketingAuthorizationHolder'
  | 'RegulatoryDocument';

export class MedicationDetailIntegrityError extends Error {
  constructor(entityKind: MedicationDetailEntityKind) {
    super(
      `This medication detail references a ${entityKind} record that is missing from the local dataset.`,
    );
    this.name = 'MedicationDetailIntegrityError';
  }
}

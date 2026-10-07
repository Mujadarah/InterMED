import type {
  MedicationCatalogueSnapshot,
  MedicationCatalogueSource,
} from '@intermed/domain';

/** Return the snapshot it was given. Callers swap sources by constructing another one. */
export function createInMemoryMedicationCatalogueSource(
  snapshot: MedicationCatalogueSnapshot,
): MedicationCatalogueSource {
  return {
    load: () => snapshot,
  };
}

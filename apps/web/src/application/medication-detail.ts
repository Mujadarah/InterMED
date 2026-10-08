import {
  parseStableId,
  type GenerationReader,
  type MedicationProductDetail,
} from '@intermed/domain';

export interface MedicationDetailService {
  /** Read one product from the currently active local generation. */
  productDetail(productId: string): Promise<MedicationProductDetail | null>;
}

export interface MedicationDetailDependencies {
  readonly activeGenerationId: () => string | null;
  readonly openReader: () => Promise<GenerationReader | null>;
}

export class MedicationDetailUnavailableError extends Error {
  constructor() {
    super('No active local medication dataset is available.');
    this.name = 'MedicationDetailUnavailableError';
  }
}

export class MedicationDetailGenerationChangedError extends Error {
  constructor() {
    super('The active medication dataset changed while the detail was read.');
    this.name = 'MedicationDetailGenerationChangedError';
  }
}

/** Read a detail projection through one pinned reader and release it promptly. */
export function createMedicationDetailService(
  dependencies: MedicationDetailDependencies,
): MedicationDetailService {
  return {
    productDetail: async (productId) => {
      const parsed = parseStableId('MedicationProduct', productId);
      if (!parsed.ok) return null;

      const generationId = dependencies.activeGenerationId();
      if (!generationId) throw new MedicationDetailUnavailableError();
      const reader = await dependencies.openReader();
      if (!reader) throw new MedicationDetailUnavailableError();

      try {
        if (
          reader.generationId !== generationId ||
          dependencies.activeGenerationId() !== generationId
        )
          throw new MedicationDetailGenerationChangedError();

        const detail = await reader.productDetail(parsed.id);
        if (dependencies.activeGenerationId() !== generationId)
          throw new MedicationDetailGenerationChangedError();
        return detail;
      } finally {
        reader.release();
      }
    },
  };
}

/** Used by injected UI setups that intentionally have no local reader. */
export const unavailableMedicationDetail = createMedicationDetailService({
  activeGenerationId: () => null,
  openReader: async () => null,
});

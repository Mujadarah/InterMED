import type {
  ActiveIngredientId,
  InteractionEvaluation,
  InteractionSelection,
} from '@intermed/domain';

/** The user-facing selection before the service pins its catalogue snapshot. */
export type InteractionCheckerSelection = Pick<
  InteractionSelection,
  'productIds' | 'ingredientIds'
> & {
  readonly ingredientIds: NonNullable<InteractionSelection['ingredientIds']>;
};

/** Synthetic-only ingredient candidate from the active local generation. */
export interface InteractionIngredientCandidate {
  readonly id: ActiveIngredientId;
  readonly name: string;
}

export interface InteractionCheckerService {
  /** Synthetic evaluation exists only in development; production has no provider. */
  readonly availability: 'synthetic-preview' | 'unavailable';
  /** Search fictional active-ingredient names in the active synthetic generation. */
  searchIngredients(
    query: string,
    signal?: AbortSignal,
  ): Promise<readonly InteractionIngredientCandidate[]>;
  /** Evaluate products plus any directly selected ingredients in one generation. */
  evaluate(
    selection: InteractionCheckerSelection,
    online: boolean,
  ): Promise<InteractionEvaluation>;
}

/** Safe default for production builds and injected setups without a reader. */
export const unavailableInteractionChecker: InteractionCheckerService = {
  availability: 'unavailable',
  searchIngredients: async () => [],
  evaluate: async () => {
    throw new Error('No interaction checker provider is available.');
  },
};

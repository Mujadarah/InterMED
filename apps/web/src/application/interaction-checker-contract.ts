import type { InteractionEvaluation } from '@intermed/domain';

export interface InteractionCheckerService {
  /** Synthetic evaluation exists only in development; production has no provider. */
  readonly availability: 'synthetic-preview' | 'unavailable';
  /** Evaluate selected products against one pinned, active catalogue generation. */
  evaluate(
    productIds: readonly string[],
    online: boolean,
  ): Promise<InteractionEvaluation>;
}

/** Safe default for production builds and injected setups without a reader. */
export const unavailableInteractionChecker: InteractionCheckerService = {
  availability: 'unavailable',
  evaluate: async () => {
    throw new Error('No interaction checker provider is available.');
  },
};

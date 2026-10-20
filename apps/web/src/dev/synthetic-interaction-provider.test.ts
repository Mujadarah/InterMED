import { deserializeCatalogue, evaluateInteractions } from '@intermed/domain';
import {
  buildSyntheticCatalogueBundle,
  SYNTHETIC_DEFAULT_INGREDIENTS,
  SYNTHETIC_DEFAULT_PRODUCTS,
} from '@intermed/local-store/synthetic';
import { expect, it } from 'vitest';
import { developmentSyntheticInteractionProvider } from './synthetic-interaction-provider';

it('reports its synthetic example pair from the harness catalogue', async () => {
  const catalogue = await buildSyntheticCatalogueBundle({
    label: 'interaction-provider-alignment',
    products: SYNTHETIC_DEFAULT_PRODUCTS,
    ingredients: SYNTHETIC_DEFAULT_INGREDIENTS,
  });
  const decoded = deserializeCatalogue(catalogue.text);
  if (!decoded.ok) throw new Error('Harness catalogue did not deserialize');

  const fictivolId = catalogue.productIds['SP-FICTIVOL'];
  const placebexId = catalogue.productIds['SP-PLACEBEX'];
  if (!fictivolId || !placebexId)
    throw new Error('Harness catalogue is missing its default products');

  const evaluation = await evaluateInteractions(
    {
      snapshot: decoded.snapshot,
      productIds: [fictivolId, placebexId],
      datasetVersionId: catalogue.generationId,
    },
    developmentSyntheticInteractionProvider,
    {
      online: false,
      maxPairs: 45,
      severityMapping: {
        mappingVersion: 'synthetic-provider-test-v1',
        reviewed: false,
        map: {},
      },
    },
  );

  expect(evaluation.interactions).toHaveLength(1);
  expect(
    evaluation.evaluatedPairCoverage.filter(
      (coverage) => coverage.status === 'reported',
    ),
  ).toHaveLength(1);
});

import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
  MedicationProductDetail,
} from '@intermed/domain';
import type { MedicationDetailService } from '../application/medication-detail';
import { getSearchStatusMessage } from './search-status';

export type MedicationDetailPageState =
  | { readonly status: 'loading' }
  | { readonly status: 'no-data'; readonly message: string }
  | {
      readonly status: 'not-found';
      readonly generationId: string;
      readonly productId: string;
      readonly retryRevision: number;
    }
  | {
      readonly status: 'error';
      readonly generationId: string;
      readonly productId: string;
      readonly retryRevision: number;
    }
  | {
      readonly status: 'success';
      readonly generationId: string;
      readonly productId: string;
      readonly retryRevision: number;
      readonly detail: MedicationProductDetail;
    };

type DetailReadState = Exclude<
  MedicationDetailPageState,
  { readonly status: 'no-data' }
>;
type SettledDetailReadState = Exclude<
  DetailReadState,
  { readonly status: 'loading' }
>;

function readStateMatchesRequest(
  state: DetailReadState,
  generationId: string,
  productId: string,
  retryRevision: number,
): state is SettledDetailReadState {
  return (
    state.status !== 'loading' &&
    state.generationId === generationId &&
    state.productId === productId &&
    state.retryRevision === retryRevision
  );
}

function generationOf(
  state: DatasetUpdateState,
): LocalDatasetGeneration | null {
  return 'generation' in state ? state.generation : null;
}

/**
 * Load-state machine behind the medication detail page: read one product from
 * the active local generation, keep stale reads out of the rendered state and
 * expose a retry action. Pure React; the page supplies the dataset source and
 * the detail service.
 */
export function useMedicationDetail(
  productId: string,
  dataset: DatasetStateSource,
  detail: MedicationDetailService,
): { pageState: MedicationDetailPageState; retry: () => void } {
  const datasetState = useSyncExternalStore(
    dataset.subscribe,
    dataset.getState,
  );
  const generation = generationOf(datasetState);
  const generationId = generation?.generationId ?? null;
  const opening = datasetState.status === 'opening';
  const noDataMessage = generation
    ? null
    : getSearchStatusMessage({
        datasetState,
        query: '',
        search: null,
      });
  const [readState, setReadState] = useState<DetailReadState>({
    status: 'loading',
  });
  const [retryRevision, setRetryRevision] = useState(0);

  const pageState: MedicationDetailPageState = opening
    ? { status: 'loading' }
    : generationId === null
      ? {
          status: 'no-data',
          message: noDataMessage ?? 'No active local dataset is available.',
        }
      : readStateMatchesRequest(
            readState,
            generationId,
            productId,
            retryRevision,
          )
        ? readState
        : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    if (opening || !generationId) return;

    void detail.productDetail(productId).then(
      (result) => {
        if (cancelled) return;
        setReadState(
          result
            ? {
                status: 'success',
                generationId,
                productId,
                retryRevision,
                detail: result,
              }
            : { status: 'not-found', generationId, productId, retryRevision },
        );
      },
      () => {
        if (cancelled) return;
        setReadState({
          status: 'error',
          generationId,
          productId,
          retryRevision,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [detail, generationId, opening, productId, retryRevision]);

  return {
    pageState,
    retry: () => {
      setRetryRevision((current) => current + 1);
    },
  };
}

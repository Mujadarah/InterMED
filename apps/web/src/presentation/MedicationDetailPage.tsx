import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  FieldState,
  LocalDatasetGeneration,
  MedicationIngredient,
  MedicationProductDetail,
  RegulatoryDocument,
} from '@intermed/domain';
import type { MedicationDetailService } from '../application/medication-detail';
import { datasetAgeText } from './dataset-age';
import { getSearchStatusMessage } from './search-status';

const NOT_PROVIDED = 'Not provided by source';

type DetailPageState =
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

type DetailReadState = Exclude<DetailPageState, { readonly status: 'no-data' }>;
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

function sourceText(value: string): string {
  return value.trim() ? value : NOT_PROVIDED;
}

function fieldText(field: FieldState<string>): string {
  return field.status === 'present' ? sourceText(field.value) : NOT_PROVIDED;
}

function catalogueStatus(status: MedicationProductDetail['product']['status']) {
  switch (status) {
    case 'active':
      return 'Present in active dataset';
    case 'removed':
      return 'Removed from dataset';
    case 'unresolved':
      return 'Unresolved product record';
  }
}

function qualityNotes(ingredient: MedicationIngredient): readonly string[] {
  const notes: string[] = [];
  if (
    ingredient.strengthUnit.status === 'invalid' ||
    ingredient.denominatorUnit.status === 'invalid'
  )
    notes.push('invalid-unit');
  if (
    (ingredient.strengthValueNormalized.status === 'unknown' &&
      ingredient.strengthValueNormalized.reason === 'ambiguous-decimal') ||
    (ingredient.denominatorValueNormalized.status === 'unknown' &&
      ingredient.denominatorValueNormalized.reason === 'ambiguous-decimal')
  )
    notes.push('ambiguous-decimal');
  return notes;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    refresh();
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);
  return online;
}

function DetailBackLink({ query }: { query: string | null }) {
  const target = query
    ? {
        pathname: '/search',
        search: `?${new URLSearchParams({ q: query }).toString()}`,
      }
    : '/search';
  const label = query
    ? `Back to results for ${query}`
    : 'Back to medication search';
  return (
    <Link className="detail-back-link" to={target}>
      {label}
    </Link>
  );
}

function Definition({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function IngredientRow({
  medicationIngredient,
  activeIngredient,
}: MedicationProductDetail['ingredients'][number]) {
  const mapped =
    medicationIngredient.mappingStatus === 'confirmed' &&
    activeIngredient !== null;
  const notes = qualityNotes(medicationIngredient);
  return (
    <li className="detail-card">
      <h3>{sourceText(medicationIngredient.sourceIngredientText)}</h3>
      <dl className="detail-list detail-list-compact">
        <Definition label="Source ingredient text">
          {sourceText(medicationIngredient.sourceIngredientText)}
        </Definition>
        <Definition label="Mapping status">
          {mapped
            ? 'Confirmed mapping'
            : medicationIngredient.mappingStatus === 'unresolved'
              ? 'Unresolved or ambiguous mapping'
              : 'Confirmed mapping; ingredient record unavailable'}
        </Definition>
        <Definition
          label={mapped ? 'Preferred name' : 'Unconfirmed candidate name'}
        >
          {activeIngredient
            ? sourceText(activeIngredient.preferredName)
            : NOT_PROVIDED}
        </Definition>
        <Definition label="DCI">
          {mapped && activeIngredient
            ? fieldText(activeIngredient.dci)
            : NOT_PROVIDED}
        </Definition>
        <Definition label="Strength as stated by source">
          {fieldText(medicationIngredient.strengthOriginalText)}
        </Definition>
      </dl>
      {notes.length > 0 && (
        <div className="data-quality-note">
          <h4>Data-quality notes</h4>
          <ul>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function DocumentRow({
  document,
  online,
}: {
  document: RegulatoryDocument;
  online: boolean;
}) {
  const url = document.url;
  const hasUrl = url.trim().length > 0;
  const canOpen = hasUrl && isHttpUrl(url);
  return (
    <li className="detail-card">
      <h3>
        {document.type} — {fieldText(document.title)}
      </h3>
      <dl className="detail-list detail-list-compact">
        <Definition label="Type">{document.type}</Definition>
        <Definition label="Title">{fieldText(document.title)}</Definition>
        <Definition label="Language">{fieldText(document.language)}</Definition>
        <Definition label="Version">
          {fieldText(document.documentVersion)}
        </Definition>
        <Definition label="Published date">
          {fieldText(document.publishedAt)}
        </Definition>
        <Definition label="Retrieved date">
          {fieldText(document.retrievedAt)}
        </Definition>
        <Definition label="Last checked date">
          {sourceText(document.lastCheckedAt)}
        </Definition>
        <Definition label="Caching rights status">
          {document.cacheRightsStatus}
        </Definition>
      </dl>
      {document.cachedContentReference.status === 'present' &&
        document.cachedContentReference.value.trim() && (
          <p className="detail-note">
            A cached content reference is recorded. Its content is not displayed
            because approval to use cached documents has not been granted.
          </p>
        )}
      <p className="document-link-status" aria-live="polite">
        {!hasUrl ? (
          NOT_PROVIDED
        ) : !canOpen ? (
          'This document URL cannot be opened from this page.'
        ) : online ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open source document in a new tab: {document.type} —{' '}
            {fieldText(document.title)}
          </a>
        ) : (
          'This document link needs an internet connection. It is unavailable while offline.'
        )}
      </p>
    </li>
  );
}

function ProductDetail({
  detail,
  online,
}: {
  detail: MedicationProductDetail;
  online: boolean;
}) {
  const { product } = detail;
  return (
    <>
      <h1 id="medication-detail-title" tabIndex={-1}>
        {sourceText(product.commercialName)}
      </h1>
      <p className="lead">
        Product information copied from the active local dataset.
      </p>
      {detail.generation.synthetic && (
        <p className="synthetic-label">Synthetic dataset</p>
      )}
      {product.status === 'removed' && (
        <p className="detail-banner" role="status">
          This product is marked removed in the active local dataset.
        </p>
      )}
      {product.status === 'unresolved' && (
        <p className="detail-banner" role="status">
          This product record is unresolved in the active local dataset.
        </p>
      )}

      <section aria-labelledby="medication-identification-title">
        <h2 id="medication-identification-title">Identification</h2>
        <dl className="detail-list">
          <Definition label="Commercial name">
            {sourceText(product.commercialName)}
          </Definition>
          <Definition label="Strength">
            {fieldText(product.strengthText)}
          </Definition>
          <Definition label="Dosage form">
            {detail.dosageForm
              ? sourceText(detail.dosageForm.originalSourceText)
              : NOT_PROVIDED}
          </Definition>
          <Definition label="Route">{fieldText(product.route)}</Definition>
          <Definition label="Pack/presentation">
            {fieldText(product.presentationOrPackDescription)}
          </Definition>
          <Definition label="CIM">{fieldText(product.cim)}</Definition>
          <Definition label="Authorization number">
            {fieldText(product.authorizationNumber)}
          </Definition>
          <Definition label="Authorization date">
            {fieldText(product.authorizationDate)}
          </Definition>
          <Definition label="Authorization status">
            {fieldText(product.authorizationStatus)}
          </Definition>
          <Definition label="Catalogue status">
            {catalogueStatus(product.status)}
          </Definition>
        </dl>
      </section>

      <section aria-labelledby="medication-composition-title">
        <h2 id="medication-composition-title">Composition</h2>
        {detail.ingredients.length === 0 ? (
          <p>{NOT_PROVIDED}</p>
        ) : (
          <ol className="detail-card-list" aria-label="Product ingredients">
            {detail.ingredients.map(
              ({ medicationIngredient, activeIngredient }) => (
                <IngredientRow
                  key={medicationIngredient.id}
                  medicationIngredient={medicationIngredient}
                  activeIngredient={activeIngredient}
                />
              ),
            )}
          </ol>
        )}
      </section>

      <section aria-labelledby="medication-atc-title">
        <h2 id="medication-atc-title">ATC codes</h2>
        {detail.atcCodes.length === 0 ? (
          <p>{NOT_PROVIDED}</p>
        ) : (
          <ul className="detail-card-list" aria-label="ATC code records">
            {detail.atcCodes.map((code) => (
              <li className="detail-card" key={code.id}>
                <dl className="detail-list detail-list-compact">
                  <Definition label="Code">{sourceText(code.code)}</Definition>
                  <Definition label="Display name">
                    {fieldText(code.displayName)}
                  </Definition>
                </dl>
                {code.illustrative && (
                  <p className="detail-note">
                    illustrative, not an official classification
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="medication-parties-title">
        <h2 id="medication-parties-title">
          Manufacturers and marketing authorization holder
        </h2>
        <dl className="detail-list">
          <div>
            <dt>Manufacturer(s)</dt>
            <dd>
              {detail.manufacturers.length === 0
                ? NOT_PROVIDED
                : detail.manufacturers
                    .map((item) => sourceText(item.name))
                    .join(', ')}
            </dd>
          </div>
          <Definition label="Marketing authorization holder">
            {detail.marketingAuthorizationHolder
              ? sourceText(detail.marketingAuthorizationHolder.name)
              : NOT_PROVIDED}
          </Definition>
        </dl>
      </section>

      <section aria-labelledby="medication-documents-title">
        <h2 id="medication-documents-title">Regulatory documents</h2>
        {detail.regulatoryDocuments.length === 0 ? (
          <p>{NOT_PROVIDED}</p>
        ) : (
          <ol
            className="detail-card-list"
            aria-label="Regulatory document records"
          >
            {detail.regulatoryDocuments.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                online={online}
              />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="medication-provenance-title">
        <h2 id="medication-provenance-title">Source and dataset provenance</h2>
        <dl className="detail-list">
          <Definition label="Data source">
            {detail.dataSource
              ? sourceText(detail.dataSource.name)
              : NOT_PROVIDED}
          </Definition>
          <Definition label="Source authority">
            {detail.dataSource
              ? sourceText(detail.dataSource.authority)
              : NOT_PROVIDED}
          </Definition>
          <Definition label="Source rights status">
            {detail.dataSource?.rightsStatus ?? NOT_PROVIDED}
          </Definition>
          <Definition label="Dataset version">
            {sourceText(detail.generation.version)}
          </Definition>
          <Definition label="Dataset published date">
            {detail.generation.publishedAt ?? NOT_PROVIDED}
          </Definition>
          <Definition label="Upstream published date">
            {detail.datasetVersion
              ? fieldText(detail.datasetVersion.upstreamPublishedAt)
              : NOT_PROVIDED}
          </Definition>
          <Definition label="Imported date">
            {sourceText(detail.generation.importedAt)}
          </Definition>
          <Definition label="Downloaded date">
            {sourceText(detail.generation.downloadedAt)}
          </Definition>
          <Definition label="Local download age">
            {datasetAgeText(detail.generation.downloadedAt)}
          </Definition>
          <Definition label="Product source version">
            {sourceText(product.sourceVersion)}
          </Definition>
          <Definition label="First seen at">
            {sourceText(product.firstSeenAt)}
          </Definition>
          <Definition label="Last seen at">
            {sourceText(product.lastSeenAt)}
          </Definition>
        </dl>
      </section>
    </>
  );
}

/** Accessible, local-only view of one product in the active generation. */
export function MedicationDetailPage({
  productId,
  dataset,
  detail,
}: {
  productId: string;
  dataset: DatasetStateSource;
  detail: MedicationDetailService;
}) {
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
  const [searchParams] = useSearchParams();
  const returnQuery = searchParams.get('q');
  const [readState, setReadState] = useState<DetailReadState>({
    status: 'loading',
  });
  const [retryRevision, setRetryRevision] = useState(0);
  const online = useOnlineStatus();
  const page = useRef<HTMLElement>(null);
  const pageState: DetailPageState = opening
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
    page.current?.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
  }, [pageState.status]);

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

  return (
    <section
      ref={page}
      className="medication-detail-page"
      aria-labelledby="medication-detail-title"
      aria-busy={pageState.status === 'loading'}
      data-testid="medication-detail-page"
    >
      <DetailBackLink query={returnQuery} />
      {pageState.status === 'loading' && (
        <>
          <h1 id="medication-detail-title" tabIndex={-1}>
            Loading medication detail
          </h1>
          <p role="status">Reading the active local medication dataset.</p>
        </>
      )}
      {pageState.status === 'not-found' && (
        <>
          <h1 id="medication-detail-title" tabIndex={-1}>
            Product not found
          </h1>
          <p role="status">
            This product was not found in the active local dataset. Its link may
            be outdated after a dataset update.
          </p>
        </>
      )}
      {pageState.status === 'no-data' && (
        <>
          <h1 id="medication-detail-title" tabIndex={-1}>
            Medication detail is unavailable
          </h1>
          <p role="status">{pageState.message}</p>
          <Link className="detail-status-link" to="/status">
            Check dataset status
          </Link>
        </>
      )}
      {pageState.status === 'error' && (
        <>
          <h1 id="medication-detail-title" tabIndex={-1}>
            Medication detail is temporarily unavailable
          </h1>
          <p role="alert">
            Medication detail could not be read. Try again or check dataset
            status.
          </p>
          <button
            type="button"
            onClick={() => setRetryRevision((current) => current + 1)}
          >
            Retry medication detail
          </button>
          <Link className="detail-status-link" to="/status">
            Check dataset status
          </Link>
        </>
      )}
      {pageState.status === 'success' && (
        <ProductDetail detail={pageState.detail} online={online} />
      )}
    </section>
  );
}

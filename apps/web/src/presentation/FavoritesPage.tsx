import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import type { DatasetStateSource } from '@intermed/domain';
import type {
  FavoriteListItem,
  PreferencesService,
} from '../application/preferences';
import { defineControls } from 'tempo-sdk/assets';
import { ConfirmationDialog } from './ConfirmationDialog';

function removedDate(removedAt: string | null): string {
  if (!removedAt) return 'Removal date unavailable.';
  const date = removedAt.slice(0, 10);
  return `Removed on ${date}.`;
}

function FavoriteRow({
  favorite,
  onRemove,
}: {
  readonly favorite: FavoriteListItem;
  readonly onRemove: (favorite: FavoriteListItem) => void;
}) {
  const available = favorite.status === 'available';
  const href = `/medication/${encodeURIComponent(favorite.productId)}`;
  return (
    <li className="favorite-entry">
      <div className="favorite-entry-copy">
        {available ? (
          <Link to={href}>{favorite.lastKnownDisplayName}</Link>
        ) : (
          <span className="favorite-name">{favorite.lastKnownDisplayName}</span>
        )}
        {available && <p>Available in the active dataset.</p>}
        {favorite.status === 'removed' && (
          <>
            <p>No longer in the active dataset.</p>
            <p>{removedDate(favorite.removedAt)}</p>
          </>
        )}
        {favorite.status === 'unresolved' && (
          <p>Could not be checked against the active dataset.</p>
        )}
        {favorite.status === 'not-checkable' && (
          <>
            <p>Status: Not checkable.</p>
            <p>Could not be checked against the active dataset.</p>
          </>
        )}
      </div>
      <button
        className="favorite-remove"
        type="button"
        aria-label={`Remove ${favorite.lastKnownDisplayName} from favorites`}
        onClick={() => onRemove(favorite)}
      >
        Remove
      </button>
    </li>
  );
}

type FavoritesLoad =
  | {
      readonly generationId: string | null;
      readonly status: 'ready';
      readonly entries: readonly FavoriteListItem[];
    }
  | {
      readonly generationId: string | null;
      readonly status: 'error';
    };

/** Local-only list of stable-id favorites with explicit reconciliation status. */
export function FavoritesPage({
  dataset,
  preferences,
}: {
  readonly dataset: DatasetStateSource;
  readonly preferences: PreferencesService;
}) {
  const state = useSyncExternalStore(dataset.subscribe, dataset.getState);
  const generation = 'generation' in state ? state.generation : null;
  const generationId = generation?.generationId ?? null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [load, setLoad] = useState<FavoritesLoad | null>(null);
  const [removing, setRemoving] = useState<FavoriteListItem | null>(null);
  const [actionError, setActionError] = useState('');
  const currentLoad = load?.generationId === generationId ? load : null;
  const favorites =
    currentLoad?.status === 'ready' ? currentLoad.entries : null;

  useEffect(() => {
    let current = true;
    void preferences.listFavorites().then(
      (entries) => {
        if (current) setLoad({ generationId, status: 'ready', entries });
      },
      () => {
        if (current) setLoad({ generationId, status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [generationId, preferences]);

  async function confirmRemove(favorite: FavoriteListItem) {
    setActionError('');
    try {
      await preferences.removeFavorite(favorite.productId);
      setLoad((current) =>
        current?.status === 'ready'
          ? {
              ...current,
              entries: current.entries.filter(
                (item) => item.productId !== favorite.productId,
              ),
            }
          : current,
      );
      setRemoving(null);
    } catch {
      setRemoving(null);
      setActionError(
        'Favorite could not be removed. Your previous state is unchanged.',
      );
    }
  }

  return (
    <section className="favorites-page" aria-labelledby="favorites-title">
      <h1 id="favorites-title" ref={headingRef} tabIndex={-1}>
        Favorites
      </h1>
      <p className="lead">Saved in this browser using stable product IDs.</p>
      {!generation && (
        <p className="detail-note" role="status">
          No active dataset is available. Favorites are not checkable.
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {currentLoad === null && <p role="status">Reading local favorites.</p>}
      {currentLoad?.status === 'error' && (
        <p role="alert">Favorites could not be read from this browser.</p>
      )}
      {favorites?.length === 0 && (
        <div className="favorite-empty-state">
          <p>No favorites yet.</p>
          <Link to="/search">Search local medications</Link>
        </div>
      )}
      {favorites && favorites.length > 0 && (
        <ul className="favorites-list" aria-label="Saved favorites">
          {favorites.map((favorite) => (
            <FavoriteRow
              key={favorite.productId}
              favorite={favorite}
              onRemove={setRemoving}
            />
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmationDialog
          title="Remove favorite?"
          message={`Remove ${removing.lastKnownDisplayName} from this browser's favorites?`}
          confirmLabel="Remove favorite"
          fallbackFocusRef={headingRef}
          onCancel={() => setRemoving(null)}
          onConfirm={() => confirmRemove(removing)}
        />
      )}
    </section>
  );
}

/* @__PURE__ */ defineControls(FavoritesPage, {
  dataset: false,
  preferences: false,
});

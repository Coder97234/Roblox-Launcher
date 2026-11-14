import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { PlacesData } from '../lib/types';
import { useLauncher } from '../state/launcher';
import { useNotifications } from '../state/notifications';
import { PlayIcon, PlusIcon, RefreshIcon, StarIcon, TrashIcon } from '../components/Icons';
import { Button, EmptyState, ErrorNotice, Panel, Spinner } from '../components/ui';

/**
 * Places are Studio files, not Roblox games: Xenity opens a .rbxl or .rbxlx in
 * Studio through Wine. Only paths the user entered are stored.
 */
export function PlacesPage() {
  const { notify } = useNotifications();
  const { run, running } = useLauncher();
  const [data, setData] = useState<PlacesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [file, setFile] = useState('');
  const [error, setError] = useState<{ what: string; why: string; next: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.places());
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? { what: cause.what, why: cause.why, next: cause.next }
          : { what: 'Your places could not be loaded.', why: String(cause), next: 'Try again.' },
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.addPlace(name, file);
      setName('');
      setFile('');
      await load();
      notify({ title: 'Place added', description: 'It is now listed in your places.', tone: 'success' });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      setError({
        what: apiError?.what ?? 'The place could not be added.',
        why: apiError?.why ?? String(cause),
        next: apiError?.next ?? 'Give the place a name and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const favorite = async (id: string, current: boolean) => {
    try {
      await api.favoritePlace(id);
      await load();
      notify({ title: current ? 'Removed from favorites' : 'Added to favorites', tone: 'info' });
    } catch (cause) {
      notify({
        title: 'Could not update favorite',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  const remove = async (id: string) => {
    try {
      await api.removePlace(id);
      await load();
      notify({ title: 'Place removed', tone: 'info' });
    } catch (cause) {
      notify({
        title: 'Could not remove the place',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  const open = async (id: string, placeName: string) => {
    await run(id, placeName);
    await load();
  };

  return (
    <div className="stack">
      {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}

      <Panel
        title="Add a place"
        subtitle="A place is a .rbxl or .rbxlx file Studio can open. Xenity stores only what you enter."
      >
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError({
                what: 'A place name is required.',
                why: 'The list cannot show an entry without a name you give it.',
                next: 'Type the place name, then add it again.',
              });
              return;
            }
            void add();
          }}
        >
          <label className="field field--column inline-form__field">
            <span className="field__label">Place name</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Obby prototype"
            />
          </label>
          <label className="field field--column inline-form__flex">
            <span className="field__label">File path (optional)</span>
            <input
              className="input"
              value={file}
              onChange={(event) => setFile(event.target.value)}
              placeholder="/home/you/Documents/Roblox/Obby.rbxl"
            />
          </label>
          <Button type="submit" variant="primary" icon={<PlusIcon size={15} />} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </form>
        <p className="panel__footnote">
          Leave the path blank to open Studio without a file. Studio’s own Open dialog can create or
          load places from its Documents folder inside the Wine prefix.
        </p>
      </Panel>

      <Panel
        title="Your places"
        subtitle={
          data ? `${data.places.length} tracked · ${data.favoriteCount} favorited` : 'Loading places'
        }
        actions={
          <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} />} onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        {loading && !data ? (
          <div className="page-loading">
            <Spinner size={18} />
            <span>Loading places…</span>
          </div>
        ) : data && data.places.length > 0 ? (
          <ul className="experience-list">
            {data.places.map((place) => (
              <li key={place.id} className="experience">
                <span className="experience__avatar" aria-hidden="true">
                  {place.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="experience__text">
                  <p className="experience__name">{place.name}</p>
                  <p className="experience__meta">
                    {place.file ?? 'Opens Studio with no file'}
                    {place.lastOpenedAt && ` · last opened ${relativeTime(place.lastOpenedAt)}`}
                  </p>
                </div>
                <div className="experience__actions">
                  <button
                    className={`icon-btn ${place.favorite ? 'icon-btn--starred' : ''}`}
                    onClick={() => void favorite(place.id, place.favorite)}
                    aria-label={place.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    aria-pressed={place.favorite}
                  >
                    <StarIcon size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => void open(place.id, place.name)}
                    disabled={running}
                    aria-label={`Open ${place.name} in Studio`}
                  >
                    {running ? <Spinner size={14} /> : <PlayIcon size={15} />}
                  </button>
                  <button
                    className="icon-btn icon-btn--danger"
                    onClick={() => void remove(place.id)}
                    aria-label={`Remove ${place.name}`}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No places yet"
            description="Add a place above. Xenity hands the file path to Roblox Studio, which opens it in the editor."
          />
        )}
      </Panel>

      <Panel title="Studio history" subtitle="Every launch Xenity actually attempted, newest first">
        {data && data.history.length > 0 ? (
          <ul className="history">
            {data.history.map((entry) => (
              <li key={entry.id} className="history__row">
                <span className={`activity__dot activity__dot--${entry.outcome === 'succeeded' ? 'ok' : 'danger'}`} />
                <span className="history__name">{entry.placeName ?? 'Roblox Studio'}</span>
                <span className="history__message">{entry.message}</span>
                <span className="history__time">{relativeTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No launches recorded"
            description="Launch attempts appear here with their real outcome, including blocked ones."
          />
        )}
      </Panel>
    </div>
  );
}

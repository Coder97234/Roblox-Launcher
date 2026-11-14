import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { LibraryData } from '../lib/types';
import { useLauncher } from '../state/launcher';
import { useNotifications } from '../state/notifications';
import { PlayIcon, PlusIcon, RefreshIcon, StarIcon, TrashIcon } from '../components/Icons';
import { Button, EmptyState, ErrorNotice, Panel, Spinner } from '../components/ui';

export function LibraryPage() {
  const { notify } = useNotifications();
  const { run, running } = useLauncher();
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<{ what: string; why: string; next: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setLibrary(await api.library());
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? { what: cause.what, why: cause.why, next: cause.next }
          : { what: 'The library could not be loaded.', why: String(cause), next: 'Try again.' },
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
      await api.addExperience(name, url);
      setName('');
      setUrl('');
      await load();
      notify({ title: 'Experience added', description: 'It is now tracked in your library.', tone: 'success' });
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      setError({
        what: apiError?.what ?? 'The experience could not be added.',
        why: apiError?.why ?? String(cause),
        next: apiError?.next ?? 'Give the entry a name and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const favorite = async (id: string, current: boolean) => {
    try {
      await api.favorite(id);
      await load();
      notify({
        title: current ? 'Removed from favorites' : 'Added to favorites',
        tone: 'info',
      });
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
      await api.removeExperience(id);
      await load();
      notify({ title: 'Experience removed', tone: 'info' });
    } catch (cause) {
      notify({
        title: 'Could not remove experience',
        description: cause instanceof ApiError ? cause.what : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  const launch = async (id: string, experienceName: string) => {
    await run(id, experienceName);
    await load();
  };

  return (
    <div className="stack">
      {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}

      <Panel
        title="Add an experience"
        subtitle="Xenity stores only what you enter — nothing is scraped or invented."
      >
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError({
                what: 'An experience name is required.',
                why: 'The library cannot show an entry without a name you give it.',
                next: 'Type the experience name, then add it again.',
              });
              return;
            }
            void add();
          }}
        >
          <label className="field field--column inline-form__field">
            <span className="field__label">Experience name</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Natural Disaster Survival"
            />
          </label>
          <label className="field field--column inline-form__flex">
            <span className="field__label">Experience link (optional)</span>
            <input
              className="input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.roblox.com/games/…"
            />
          </label>
          <Button type="submit" variant="primary" icon={<PlusIcon size={15} />} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Panel>

      <Panel
        title="Your experiences"
        subtitle={
          library
            ? `${library.experiences.length} tracked · ${library.favoriteCount} favorited`
            : 'Loading library'
        }
        actions={
          <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} />} onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        {loading && !library ? (
          <div className="page-loading">
            <Spinner size={18} />
            <span>Loading library…</span>
          </div>
        ) : library && library.experiences.length > 0 ? (
          <ul className="experience-list">
            {library.experiences.map((experience) => (
              <li key={experience.id} className="experience">
                <span className="experience__avatar" aria-hidden="true">
                  {experience.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="experience__text">
                  <p className="experience__name">{experience.name}</p>
                  <p className="experience__meta">
                    {experience.url ? experience.url : 'No link saved'}
                    {experience.lastLaunchedAt && ` · last launched ${relativeTime(experience.lastLaunchedAt)}`}
                  </p>
                </div>
                <div className="experience__actions">
                  <button
                    className={`icon-btn ${experience.favorite ? 'icon-btn--starred' : ''}`}
                    onClick={() => void favorite(experience.id, experience.favorite)}
                    aria-label={experience.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    aria-pressed={experience.favorite}
                  >
                    <StarIcon size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => void launch(experience.id, experience.name)}
                    disabled={running}
                    aria-label={`Launch ${experience.name}`}
                  >
                    {running ? <Spinner size={14} /> : <PlayIcon size={15} />}
                  </button>
                  <button
                    className="icon-btn icon-btn--danger"
                    onClick={() => void remove(experience.id)}
                    aria-label={`Remove ${experience.name}`}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No experiences tracked yet"
            description="Add an experience above. Deep-link launching through official Roblox mechanisms is planned, not implemented in this build."
          />
        )}
      </Panel>

      <Panel
        title="Launch history"
        subtitle="Every attempt Xenity actually made, newest first"
      >
        {library && library.history.length > 0 ? (
          <ul className="history">
            {library.history.map((entry) => (
              <li key={entry.id} className="history__row">
                <span className={`activity__dot activity__dot--${entry.outcome === 'succeeded' ? 'ok' : 'danger'}`} />
                <span className="history__name">{entry.experienceName ?? 'Roblox'}</span>
                <span className="history__message">{entry.message}</span>
                <span className="history__time">{relativeTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No launches recorded"
            description="Launch attempts appear here with their real outcome, including blocked launches."
          />
        )}
      </Panel>
    </div>
  );
}

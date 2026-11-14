import path from 'node:path';
import { readJson, writeJson, xenityPaths } from './store.js';

const HISTORY_LIMIT = 50;

function libraryFile() {
  return path.join(xenityPaths().config, 'library.json');
}

const EMPTY = { experiences: [], history: [] };

function load() {
  const stored = readJson(libraryFile(), EMPTY);
  return {
    experiences: Array.isArray(stored.experiences) ? stored.experiences : [],
    history: Array.isArray(stored.history) ? stored.history : [],
  };
}

function save(data) {
  writeJson(libraryFile(), data);
  return data;
}

/**
 * Library holds only entries the user added themselves or launches Xenity
 * actually attempted — no experience data is ever invented.
 */
export function getLibrary() {
  const data = load();
  const favoriteIds = new Set(data.experiences.filter((entry) => entry.favorite).map((e) => e.id));
  return {
    experiences: data.experiences,
    favorites: data.experiences.filter((entry) => entry.favorite),
    recent: [...data.history]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10),
    history: data.history,
    favoriteCount: favoriteIds.size,
    empty: data.experiences.length === 0 && data.history.length === 0,
  };
}

export function addExperience({ name, url }) {
  const data = load();
  const trimmedName = String(name || '').trim().slice(0, 80);
  const trimmedUrl = String(url || '').trim().slice(0, 300);
  if (!trimmedName) {
    const error = new Error('An experience name is required.');
    error.status = 400;
    throw error;
  }
  const entry = {
    id: `exp_${Date.now().toString(36)}`,
    name: trimmedName,
    url: trimmedUrl || null,
    favorite: false,
    addedAt: new Date().toISOString(),
    lastLaunchedAt: null,
  };
  data.experiences = [entry, ...data.experiences].slice(0, 100);
  save(data);
  return entry;
}

export function toggleFavorite(id) {
  const data = load();
  const entry = data.experiences.find((item) => item.id === id);
  if (!entry) {
    const error = new Error('That experience is not in the library.');
    error.status = 404;
    throw error;
  }
  entry.favorite = !entry.favorite;
  save(data);
  return entry;
}

export function removeExperience(id) {
  const data = load();
  const before = data.experiences.length;
  data.experiences = data.experiences.filter((item) => item.id !== id);
  save(data);
  return { removed: before !== data.experiences.length };
}

export function recordLaunch({ experienceId = null, outcome, message }) {
  const data = load();
  const experience = experienceId
    ? data.experiences.find((item) => item.id === experienceId)
    : null;
  const entry = {
    id: `launch_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    experienceId,
    experienceName: experience?.name ?? null,
    outcome,
    message,
  };
  data.history = [entry, ...data.history].slice(0, HISTORY_LIMIT);
  if (experience) experience.lastLaunchedAt = entry.at;
  save(data);
  return entry;
}

export function lastLaunch() {
  const { history } = load();
  const sorted = [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return sorted[0] ?? null;
}

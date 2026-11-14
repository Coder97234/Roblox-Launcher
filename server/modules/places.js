import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, xenityPaths } from './store.js';

const HISTORY_LIMIT = 50;
const PLACE_EXTENSION = /\.(rbxl|rbxlx)$/i;

function placesFile() {
  return path.join(xenityPaths().config, 'places.json');
}

const EMPTY = { places: [], history: [] };

function load() {
  const stored = readJson(placesFile(), EMPTY);
  return {
    places: Array.isArray(stored.places) ? stored.places : [],
    history: Array.isArray(stored.history) ? stored.history : [],
  };
}

function save(data) {
  writeJson(placesFile(), data);
  return data;
}

/**
 * Places are Studio files the user pointed Xenity at. Xenity stores the path
 * and the name it was given — it never scans the filesystem for .rbxl files,
 * and never invents an entry.
 */
export function getPlaces() {
  const data = load();
  const favoriteIds = new Set(data.places.filter((entry) => entry.favorite).map((entry) => entry.id));
  return {
    places: data.places,
    favorites: data.places.filter((entry) => entry.favorite),
    recent: [...data.history]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10),
    history: data.history,
    favoriteCount: favoriteIds.size,
    empty: data.places.length === 0 && data.history.length === 0,
  };
}

export function findPlace(id) {
  if (!id) return null;
  return load().places.find((entry) => entry.id === id) ?? null;
}

export function addPlace({ name, file }) {
  const data = load();
  const trimmedName = String(name || '').trim().slice(0, 80);
  const trimmedFile = String(file || '').trim().slice(0, 400);
  if (!trimmedName) {
    const error = new Error('A place name is required.');
    error.status = 400;
    throw error;
  }
  if (trimmedFile) {
    if (!PLACE_EXTENSION.test(trimmedFile)) {
      const error = new Error('A place file must end in .rbxl or .rbxlx.');
      error.status = 400;
      throw error;
    }
    if (!fs.existsSync(trimmedFile)) {
      const error = new Error(`No file exists at ${trimmedFile}.`);
      error.status = 400;
      throw error;
    }
  }
  const entry = {
    id: `place_${Date.now().toString(36)}`,
    name: trimmedName,
    file: trimmedFile || null,
    favorite: false,
    addedAt: new Date().toISOString(),
    lastOpenedAt: null,
  };
  data.places = [entry, ...data.places].slice(0, 100);
  save(data);
  return entry;
}

export function toggleFavorite(id) {
  const data = load();
  const entry = data.places.find((item) => item.id === id);
  if (!entry) {
    const error = new Error('That place is not in the list.');
    error.status = 404;
    throw error;
  }
  entry.favorite = !entry.favorite;
  save(data);
  return entry;
}

export function removePlace(id) {
  const data = load();
  const before = data.places.length;
  data.places = data.places.filter((item) => item.id !== id);
  save(data);
  return { removed: before !== data.places.length };
}

export function recordLaunch({ placeId = null, outcome, message }) {
  const data = load();
  const place = placeId ? data.places.find((item) => item.id === placeId) : null;
  const entry = {
    id: `open_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    placeId,
    placeName: place?.name ?? null,
    outcome,
    message,
  };
  data.history = [entry, ...data.history].slice(0, HISTORY_LIMIT);
  if (place) place.lastOpenedAt = entry.at;
  save(data);
  return entry;
}

export function lastLaunch() {
  const { history } = load();
  const sorted = [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return sorted[0] ?? null;
}

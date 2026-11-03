const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Treat localStorage as untrusted input; keep only the current guide's IDs. */
export function normalizeState(value, schema = {}) {
  const state = { version: 1, notes: {}, favorite: [], done: [], checks: {} };
  if (!isRecord(value)) return state;
  const allowed = (list) =>
    new Set(
      (Array.isArray(list) ? list : []).filter(
        (id) => typeof id === 'string' && !RESERVED_KEYS.has(id),
      ),
    );
  const questionIds = allowed(schema.questionIds);
  const noteIds = allowed(schema.noteIds);
  const checkIds = allowed(schema.checkIds);
  if (isRecord(value.notes)) {
    for (const [id, note] of Object.entries(value.notes)) {
      if (noteIds.has(id) && typeof note === 'string') state.notes[id] = note.slice(0, 20000);
    }
  }
  for (const key of ['favorite', 'done']) {
    if (Array.isArray(value[key])) {
      state[key] = [...new Set(value[key].filter((id) => questionIds.has(id)))];
    }
  }
  if (isRecord(value.checks)) {
    for (const [id, checked] of Object.entries(value.checks)) {
      if (checkIds.has(id) && typeof checked === 'boolean') state.checks[id] = checked;
    }
  }
  return state;
}

export function readState(storage, key, schema) {
  try {
    const raw = storage.getItem(key);
    return { ok: true, state: normalizeState(raw === null ? null : JSON.parse(raw), schema) };
  } catch {
    return { ok: false, state: normalizeState(null, schema) };
  }
}

export function writeState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify(state));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

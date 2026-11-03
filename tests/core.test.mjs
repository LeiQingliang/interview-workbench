import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEconomics } from '../src/lib/economics.js';
import { normalizeState, readState, writeState } from '../src/lib/storage.js';

const schema = {
  questionIds: ['q-one', 'q-two'],
  noteIds: ['note-one', 'note-two'],
  checkIds: ['check-one', 'check-two'],
};

const emptyState = () => ({ version: 1, notes: {}, favorite: [], done: [], checks: {} });

function approximately(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}

test('economics: the default scenario uses redeemed revenue and every stated cost', () => {
  const result = calculateEconomics({
    price: 49,
    cost: 25,
    orders: 2000,
    redemptionRate: 60,
    feeRate: 3,
    marketing: 5000,
    operations: 1000,
  });
  approximately(result.redeemed, 1200);
  approximately(result.revenue, 58800);
  approximately(result.unitContribution, 22.53);
  approximately(result.contribution, 21036);
  assert.equal(result.breakEvenOrders, 444);
});

test('economics: break-even is paid orders, including the redemption rate', () => {
  const result = calculateEconomics({
    price: 59,
    cost: 24,
    orders: 200,
    redemptionRate: 50,
    feeRate: 8,
    marketing: 2000,
    operations: 1000,
  });
  approximately(result.redeemed, 100);
  approximately(result.revenue, 5900);
  approximately(result.contribution, 28);
  assert.equal(result.breakEvenOrders, 199);
});

test('economics: zero redemption has no reachable break-even', () => {
  const result = calculateEconomics({
    price: 59,
    cost: 24,
    orders: 200,
    redemptionRate: 0,
    feeRate: 8,
    marketing: 2000,
    operations: 1000,
  });
  assert.equal(result.redeemed, 0);
  assert.equal(result.revenue, 0);
  assert.equal(result.contribution, -3000);
  assert.equal(result.breakEvenOrders, null);
});

test('economics: loss-making units remain a loss and cannot break even', () => {
  const result = calculateEconomics({
    price: 10,
    cost: 12,
    orders: 50,
    redemptionRate: 100,
    feeRate: 0,
    marketing: 25,
    operations: 25,
  });
  assert.equal(result.unitContribution, -2);
  assert.equal(result.contribution, -150);
  assert.equal(result.breakEvenOrders, null);
});

test('economics: negative and non-finite inputs are treated as zero', () => {
  const result = calculateEconomics({
    price: Infinity,
    cost: -20,
    orders: NaN,
    redemptionRate: -5,
    feeRate: Infinity,
    marketing: -500,
    operations: -Infinity,
  });
  assert.equal(result.redeemed, 0);
  assert.equal(result.revenue, 0);
  assert.equal(result.unitContribution, 0);
  assert.equal(result.contribution, 0);
  assert.equal(result.breakEvenOrders, null);
});

test('economics: percentage inputs are capped at 100', () => {
  const result = calculateEconomics({
    price: 20,
    cost: 5,
    orders: 10,
    redemptionRate: 150,
    feeRate: 200,
    marketing: 0,
    operations: 0,
  });
  assert.equal(result.redeemed, 10);
  assert.equal(result.revenue, 200);
  assert.equal(result.unitContribution, -5);
  assert.equal(result.contribution, -50);
  assert.equal(result.breakEvenOrders, null);
});

test('economics: positive unit margin with no fixed spend breaks even at zero orders', () => {
  const result = calculateEconomics({
    price: 20,
    cost: 5,
    orders: 0,
    redemptionRate: 50,
    feeRate: 0,
    marketing: 0,
    operations: 0,
  });
  assert.equal(result.breakEvenOrders, 0);
  assert.equal(result.contribution, 0);
});

test('storage: invalid roots normalize to a fresh empty state', () => {
  for (const value of [null, undefined, false, 123, 'text', []]) {
    assert.deepEqual(normalizeState(value, schema), emptyState());
  }
});

test('storage: only known IDs and correctly typed values survive', () => {
  const original = {
    version: 1,
    notes: { 'note-one': 'A concrete example', 'note-two': 42, unknown: 'discard' },
    favorite: ['q-one', 'unknown', 'q-one', null, 42],
    done: ['q-two', 'q-two', false],
    checks: { 'check-one': true, 'check-two': 'yes', unknown: true },
    unrelated: 'discard',
  };
  const snapshot = JSON.stringify(original);
  assert.deepEqual(normalizeState(original, schema), {
    version: 1,
    notes: { 'note-one': 'A concrete example' },
    favorite: ['q-one'],
    done: ['q-two'],
    checks: { 'check-one': true },
  });
  assert.equal(JSON.stringify(original), snapshot, 'normalization must not mutate its input');
});

test('storage: malformed nested containers do not become state entries', () => {
  assert.deepEqual(
    normalizeState(
      {
        notes: ['unexpected'],
        favorite: { 'q-one': true },
        done: 'q-two',
        checks: ['unexpected'],
      },
      schema,
    ),
    emptyState(),
  );
});

test('storage: explicit false checklist values are preserved', () => {
  const result = normalizeState({ checks: { 'check-one': false } }, schema);
  assert.deepEqual(result.checks, { 'check-one': false });
});

test('storage: reserved keys cannot enter state or pollute object prototypes', () => {
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const hostileSchema = {
    questionIds: [...schema.questionIds, ...dangerous],
    noteIds: [...schema.noteIds, ...dangerous],
    checkIds: [...schema.checkIds, ...dangerous],
  };
  const input = JSON.parse(
    '{"notes":{"__proto__":"polluted","constructor":"polluted","prototype":"polluted","note-one":"safe"},"favorite":["__proto__","constructor","prototype","q-one"],"done":["__proto__","q-two"],"checks":{"__proto__":true,"constructor":true,"prototype":true,"check-one":true}}',
  );
  const result = normalizeState(input, hostileSchema);
  for (const key of dangerous) {
    assert.equal(Object.hasOwn(result.notes, key), false);
    assert.equal(Object.hasOwn(result.checks, key), false);
    assert.equal(result.favorite.includes(key), false);
    assert.equal(result.done.includes(key), false);
  }
  assert.equal(result.notes['note-one'], 'safe');
  assert.deepEqual(result.favorite, ['q-one']);
  assert.deepEqual(result.done, ['q-two']);
  assert.equal({}.polluted, undefined);
});

test('storage: normal read/write round-trips the application state', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const state = { ...emptyState(), notes: { 'note-one': 'Saved note' }, favorite: ['q-one'] };
  assert.equal(writeState(storage, 'workbench-test', state).ok, true);
  const read = readState(storage, 'workbench-test', schema);
  assert.equal(read.ok, true);
  assert.deepEqual(read.state, state);
});

test('storage: unavailable browser storage is reported without throwing', () => {
  const blocked = {
    getItem() {
      throw new Error('Storage is blocked');
    },
    setItem() {
      throw new Error('Storage quota exceeded');
    },
  };
  assert.equal(readState(blocked, 'workbench-test', schema).ok, false);
  assert.equal(writeState(blocked, 'workbench-test', emptyState()).ok, false);
});

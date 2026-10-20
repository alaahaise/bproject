'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLineWeight, summarizeWeights } = require('../src/weight');

test('uses the explicit line weight first', () => {
  assert.deepEqual(
    resolveLineWeight({
      quantity: 4,
      lineWeight: 10,
      unitWeight: 1,
      articleWeight: 2,
    }),
    { weightKg: 10, unitWeightKg: 2.5, weightSource: 'line' }
  );
});

test('multiplies the unit weight by the quantity', () => {
  assert.deepEqual(
    resolveLineWeight({
      quantity: 3,
      lineWeight: 0,
      unitWeight: 2.5,
      articleWeight: 4,
    }),
    { weightKg: 7.5, unitWeightKg: 2.5, weightSource: 'unit' }
  );
});

test('falls back to the article weight', () => {
  assert.deepEqual(
    resolveLineWeight({
      quantity: 3,
      lineWeight: null,
      unitWeight: 0,
      articleWeight: 2,
    }),
    { weightKg: 6, unitWeightKg: 2, weightSource: 'article' }
  );
});

test('converts Qte from quintals to kg when the product has no weight', () => {
  // 2 colis / Qte 1 = 1 quintal = 100 kg for a finished veterinary product.
  assert.deepEqual(
    resolveLineWeight({
      quantity: 1,
      lineWeight: 0,
      unitWeight: 0,
      articleWeight: 0,
    }),
    { weightKg: 100, unitWeightKg: 100, weightSource: 'quintal' }
  );
});

test('keeps an unknown weight as null when there is no quantity either', () => {
  assert.deepEqual(
    resolveLineWeight({
      quantity: 0,
      lineWeight: 0,
      unitWeight: 0,
      articleWeight: 0,
    }),
    { weightKg: null, unitWeightKg: null, weightSource: null }
  );
});

test('a zero line weight does not hide a valid article weight', () => {
  const result = resolveLineWeight({
    quantity: '2',
    lineWeight: '0',
    unitWeight: null,
    articleWeight: '1.5',
  });
  assert.equal(result.weightKg, 3);
  assert.equal(result.weightSource, 'article');
});

test('summarizes the quintal fallback into a BL total', () => {
  const lines = [2, 6, 12].map((quantity) =>
    resolveLineWeight({ quantity, lineWeight: 0, unitWeight: 0, articleWeight: 0 })
  );

  assert.deepEqual(summarizeWeights(lines), {
    totalWeightKg: 2000,
    knownWeightKg: 2000,
    weightComplete: true,
    unknownWeightLines: 0,
  });
});

test('summarizes a complete set of lines', () => {
  assert.deepEqual(
    summarizeWeights([
      { weightKg: 10 },
      { weightKg: 2.5 },
    ]),
    {
      totalWeightKg: 12.5,
      knownWeightKg: 12.5,
      weightComplete: true,
      unknownWeightLines: 0,
    }
  );
});

test('does not expose a partial total as the BL total', () => {
  assert.deepEqual(
    summarizeWeights([
      { weightKg: 10 },
      { weightKg: null },
    ]),
    {
      totalWeightKg: null,
      knownWeightKg: 10,
      weightComplete: false,
      unknownWeightLines: 1,
    }
  );
});

test('an empty line list has no total', () => {
  assert.deepEqual(summarizeWeights([]), {
    totalWeightKg: null,
    knownWeightKg: 0,
    weightComplete: false,
    unknownWeightLines: 0,
  });
});

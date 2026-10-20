'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBlInput, BadRequestError } = require('../src/numberParser');

test('parses a full BL reference', () => {
  assert.deepEqual(parseBlInput('BL26-05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('parses a full reference without separators', () => {
  assert.deepEqual(parseBlInput('BL2605255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('parses a four-digit year', () => {
  assert.deepEqual(parseBlInput('BL2026-05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('parses year and number without the BL prefix', () => {
  assert.deepEqual(parseBlInput('26-05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
  assert.deepEqual(parseBlInput('2026-05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('parses a bare number', () => {
  assert.deepEqual(parseBlInput('5255'), {
    reference: null,
    year: null,
    number: 5255,
  });
  assert.deepEqual(parseBlInput('05255'), {
    reference: null,
    year: null,
    number: 5255,
  });
});

test('accepts spaces, slashes and a number sign', () => {
  assert.deepEqual(parseBlInput('N° BL 26/05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
  assert.deepEqual(parseBlInput('BL N° 26-05255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('uses the year query parameter for a bare number', () => {
  assert.deepEqual(parseBlInput('5255', '2025'), {
    reference: null,
    year: 2025,
    number: 5255,
  });
});

test('parses a bare number with a BL prefix', () => {
  assert.deepEqual(parseBlInput('BL05255'), {
    reference: null,
    year: null,
    number: 5255,
  });
  assert.deepEqual(parseBlInput('BL 5255'), {
    reference: null,
    year: null,
    number: 5255,
  });
});

test('parses a compact year + number without the BL prefix', () => {
  assert.deepEqual(parseBlInput('2605255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
  assert.deepEqual(parseBlInput('202605255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('parses a short BL reference', () => {
  assert.deepEqual(parseBlInput('BL230001'), {
    reference: null,
    year: 2023,
    number: 1,
  });
});

test('parses a compact four-digit-year reference', () => {
  assert.deepEqual(parseBlInput('BL202605255'), {
    reference: null,
    year: 2026,
    number: 5255,
  });
});

test('rejects a conflicting year', () => {
  assert.throws(
    () => parseBlInput('BL26-05255', '2025'),
    (error) => error instanceof BadRequestError
  );
});

test('rejects invalid input', () => {
  assert.throws(() => parseBlInput('abc'), BadRequestError);
  assert.throws(() => parseBlInput(''), BadRequestError);
  assert.throws(() => parseBlInput('BL'), BadRequestError);
  assert.throws(() => parseBlInput('12345678901'), BadRequestError);
});

'use strict';

/**
 * Parses what an agent types into a BL lookup.
 *
 * Accepted forms:
 *   BL26-05255, BL2605255, BL26-5255, BL 26-05255
 *   BL2026-05255
 *   26-05255, 2026-05255
 *   5255, 05255
 *
 * A 2-digit year is interpreted as 2000-2099.
 */

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
    this.statusCode = 400;
  }
}

function parseYear(value, label = 'year') {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{2}$|^\d{4}$/.test(text)) {
    throw new BadRequestError(`Invalid ${label}: "${value}"`);
  }
  const year = text.length === 2 ? 2000 + Number(text) : Number(text);
  if (year < 2000 || year > 2100) {
    throw new BadRequestError(`Invalid ${label}: "${value}"`);
  }
  return year;
}

function parseBlInput(raw, yearParam) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new BadRequestError('BL number is required.');
  }

  const explicitYear = parseYear(yearParam);
  const input = String(raw)
    .trim()
    .toUpperCase()
    .replace(/N\s*[°º]/g, '')
    .replace(/^(NO|#)\s*/, '')
    .replace(/[\s._/]/g, '');

  let year = null;
  let number = null;
  let reference = null;

  // Four-digit year only when the year and number are clearly separated
  // (BL2026-05255). Without this rule BL2605255 would be read as year 2605.
  let match = input.match(/^BL-?(\d{4})-(\d{1,6})$/);
  if (match) {
    year = Number(match[1]);
    number = Number(match[2]);
  }

  if (year === null) {
    match = input.match(/^BL-?(\d{4})(\d{5})$/);
    if (match) {
      year = Number(match[1]);
      number = Number(match[2]);
    }
  }

  if (year === null) {
    match = input.match(/^BL-?(\d{2})-(\d{1,6})$/);
    if (match) {
      year = 2000 + Number(match[1]);
      number = Number(match[2]);
    }
  }

  // BL2605255 (year + 5-digit number, no separator). The 4-6 digit minimum
  // keeps BL05255 (a bare number) from being read as year 2005 / number 255.
  if (year === null) {
    match = input.match(/^BL-?(\d{2})(\d{4,6})$/);
    if (match) {
      year = 2000 + Number(match[1]);
      number = Number(match[2]);
    }
  }

  // BL5255 / BL 05255: a number without a year.
  if (year === null && number === null) {
    match = input.match(/^BL-?(\d{1,6})$/);
    if (match) {
      number = Number(match[1]);
    }
  }

  if (year === null) {
    match = input.match(/^(\d{4})-(\d{1,6})$/);
    if (match) {
      year = Number(match[1]);
      number = Number(match[2]);
    }
  }

  if (year === null) {
    match = input.match(/^(\d{2})-(\d{1,6})$/);
    if (match) {
      year = 2000 + Number(match[1]);
      number = Number(match[2]);
    }
  }

  if (year === null) {
    match = input.match(/^(\d{4})(\d{5})$/);
    if (match) {
      year = Number(match[1]);
      number = Number(match[2]);
    }
  }

  if (year === null) {
    match = input.match(/^(\d{2})(\d{5})$/);
    if (match) {
      year = 2000 + Number(match[1]);
      number = Number(match[2]);
    }
  }

  if (year === null) {
    match = input.match(/^\d{1,6}$/);
    if (match) {
      number = Number(input);
    }
  }

  if (year === null && number === null && /^BL\d{5,8}$/.test(input)) {
    // Defensive fallback: BL + year + number with no separator was handled
    // above; anything left is invalid.
    throw new BadRequestError(`Unrecognised BL number: "${raw}"`);
  }

  if (number === null) {
    // A full reference we didn't recognise (e.g. a legacy format) is still
    // allowed to pass through as an exact-match string.
    if (/^BL[A-Z0-9-]{1,20}$/.test(input)) {
      reference = input;
    } else {
      throw new BadRequestError(`Unrecognised BL number: "${raw}"`);
    }
  }

  if (year !== null && (year < 2000 || year > 2100)) {
    throw new BadRequestError(`Invalid year: "${year}"`);
  }

  if (number !== null && (number < 0 || number > 999999)) {
    throw new BadRequestError(`Invalid BL number: "${number}"`);
  }

  if (explicitYear !== null) {
    if (year !== null && year !== explicitYear) {
      throw new BadRequestError(
        `The year in the BL number (${year}) does not match the requested year (${explicitYear}).`
      );
    }
    year = explicitYear;
  }

  return { reference, year, number };
}

module.exports = { parseBlInput, parseYear, BadRequestError };

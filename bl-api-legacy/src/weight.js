'use strict';

/**
 * Weight resolution for BL lines.
 *
 * HFSQL stores weight in more than one place depending on how the article was
 * configured. The order below is deliberate: an explicit line weight is the
 * value the salesperson saw on the BL, then the unit weight, then the article
 * master weight. Finished veterinary products have no weight at all; for those
 * the BL quantity (`Qte`) is expressed in quintals (1 quintal = 100 kg).
 * A missing weight is kept as `null`; it must never become 0, because 0 kg
 * would silently look like a valid weight to the weighbridge.
 */
const KG_PER_QUINTAL = 100;

function positive(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function round3(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * @param {object} line
 * @param {number|string|null} [line.quantity] Ligne_MT.Qte (quintals when no weight is configured)
 * @param {number|string|null} [line.lineWeight] Ligne_MT.POIDS (line total, kg)
 * @param {number|string|null} [line.unitWeight] Ligne_MT.POIDS_UN (kg per unit)
 * @param {number|string|null} [line.articleWeight] Articles.POIDS_BRUT (kg per unit)
 * @returns {{weightKg: number|null, unitWeightKg: number|null, weightSource: 'line'|'unit'|'article'|'quintal'|null}}
 */
function resolveLineWeight({ quantity, lineWeight, unitWeight, articleWeight } = {}) {
  const qty = positive(quantity);
  const line = positive(lineWeight);

  if (line !== null) {
    return {
      weightKg: round3(line),
      unitWeightKg: qty !== null ? round3(line / qty) : null,
      weightSource: 'line',
    };
  }

  const unit = positive(unitWeight);
  if (unit !== null && qty !== null) {
    return {
      weightKg: round3(unit * qty),
      unitWeightKg: round3(unit),
      weightSource: 'unit',
    };
  }

  const article = positive(articleWeight);
  if (article !== null && qty !== null) {
    return {
      weightKg: round3(article * qty),
      unitWeightKg: round3(article),
      weightSource: 'article',
    };
  }

  // Veterinary finished products carry no weight: the BL quantity is in
  // quintals. 2 colis / Qte 1 therefore means 1 quintal = 100 kg.
  if (qty !== null) {
    return {
      weightKg: round3(qty * KG_PER_QUINTAL),
      unitWeightKg: KG_PER_QUINTAL,
      weightSource: 'quintal',
    };
  }

  return {
    weightKg: null,
    unitWeightKg: unit !== null ? round3(unit) : article !== null ? round3(article) : null,
    weightSource: null,
  };
}

function summarizeWeights(lines = []) {
  let knownWeightKg = 0;
  let unknownWeightLines = 0;

  for (const line of lines) {
    const weight = positive(line && line.weightKg);
    if (weight === null) unknownWeightLines += 1;
    else knownWeightKg += weight;
  }

  const weightComplete = lines.length > 0 && unknownWeightLines === 0;

  return {
    totalWeightKg: weightComplete ? round3(knownWeightKg) : null,
    knownWeightKg: round3(knownWeightKg),
    weightComplete,
    unknownWeightLines,
  };
}

module.exports = { resolveLineWeight, summarizeWeights, round3 };

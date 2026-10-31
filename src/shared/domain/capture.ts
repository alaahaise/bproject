/**
 * Pourquoi le bouton de pesée est-il (ou n'est-il pas) utilisable ?
 *
 * La règle est la même qu'avant la refonte de l'écran (poids stable lu sur la
 * balance, ou poids tapé à la main, et saisie du ticket complète), mais elle
 * renvoie maintenant la RAISON du blocage : l'opérateur lit une phrase au lieu
 * de deviner pourquoi un bouton est grisé.
 */

/** Blocages qui viennent de la saisie du ticket, décidés par l'écran. */
export type FormBlock = 'incompleteLines' | 'needLines' | 'needVracProduct' | 'needBl' | 'staleTicket'

export type CaptureBlock =
  FormBlock | 'busy' | 'balanceOff' | 'noSample' | 'unstable' | 'manualEmpty'

export interface CaptureState {
  /** Un enregistrement est déjà en cours : pas de second clic. */
  busy: boolean
  formBlock: FormBlock | null
  /** Poids tapé au clavier plutôt que lu sur la balance. */
  manual: boolean
  typedValid: boolean
  /** La liaison avec la balance est active. */
  running: boolean
  hasSample: boolean
  stable: boolean
}

/** `null` = on peut peser. Sinon la première raison qui l'empêche, dans l'ordre où l'opérateur peut agir. */
export function captureBlock(state: CaptureState): CaptureBlock | null {
  if (state.busy) return 'busy'
  // La saisie du ticket passe avant le poids : c'est l'opérateur qui la corrige.
  if (state.formBlock) return state.formBlock
  if (state.manual) return state.typedValid ? null : 'manualEmpty'
  if (!state.hasSample) return state.running ? 'noSample' : 'balanceOff'
  return state.stable ? null : 'unstable'
}

/**
 * Poids tapé à la main, en kg : « 12450.5 » ou « 12450,5 ».
 * Vide, illisible ou négatif = `null`.
 */
export function parseTypedWeight(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  // Match storage and IPC rules exactly: decimal kg to 3 places, no exponent,
  // and no value above the capture schema's 1,000,000 kg limit.
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null
}

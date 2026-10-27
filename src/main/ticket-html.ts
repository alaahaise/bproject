/**
 * Génère le HTML du ticket, imprimable sur rouleau 80 mm.
 *
 * Le renderer affiche exactement ce HTML dans un cadre (`ops.html`) et
 * l'imprimante reçoit le même (`ops.print`) : un seul gabarit, donc aucun écart
 * possible entre l'aperçu et le papier.
 *
 * Tout ce qui vient de la base est échappé : un code produit ou un nom de tiers
 * saisi à la main finirait sinon exécuté dans la fenêtre d'impression.
 */
import type { Lang, Location } from '@shared/channels'
import { asksFrom, asksTo, locationFieldsFor } from '@shared/domain/locations'
import { isManualKind } from '@shared/domain/weighing'
import type { Operation, OperationType } from '@shared/types'

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

interface Labels {
  title: string
  ticket: string
  date: string
  plate: string
  driver: string
  product: string
  quantity: string
  partner: string
  bl: string
  from: string
  to: string
  gross: string
  tare: string
  net: string
  supposed: string
  gap: string
  ok: string
  out: string
  operator: string
  station: string
  outside: string
  cancelled: string
  retour: string
  vrac: string
  vracPending: string
  quantityVrac: string
  primaryTitle: string
  waitingSecond: string
  manualLegend: string
  types: Record<OperationType, string>
  firstWeigh: string
  secondWeigh: string
  tagline: string
}

const LABELS: Record<Lang, Labels> = {
  fr: {
    title: 'GESTION DES PESÉES',
    ticket: 'Ticket',
    date: 'Date',
    plate: 'Matricule',
    driver: 'Chauffeur',
    product: 'Produit',
    quantity: 'Qté supposée',
    partner: 'Tiers',
    bl: 'N° BL',
    from: 'Origine',
    to: 'Destination',
    gross: 'Brut',
    tare: 'Tare',
    net: 'NET PRODUIT',
    supposed: 'Poids supposé',
    gap: 'Écart',
    ok: 'Conforme',
    out: 'Hors tolérance',
    operator: 'Opérateur',
    station: 'Poste',
    outside: 'Extérieur',
    cancelled: 'TICKET ANNULÉ',
    retour: 'RETOUR',
    vrac: 'VRAC',
    vracPending: 'BL À ÉTABLIR PAR LE COMMERCIAL',
    quantityVrac: 'Qté pesée',
    primaryTitle: 'BON DE PESÉE N° 1 — À COMPLÉTER',
    waitingSecond: 'En attente de la 2e pesée',
    manualLegend: 'M = pesée manuelle',
    types: {
      ENTREE: "TICKET D'ENTRÉE",
      SORTIE: 'TICKET DE SORTIE',
      TRANSFERT: 'TICKET DE TRANSFERT',
      TIERS: 'PESÉE TIERS'
    },
    firstWeigh: '1re pesée',
    secondWeigh: '2e pesée',
    tagline: 'Élevons la qualité ensemble'
  },
  ar: {
    title: 'إدارة الوزن',
    ticket: 'التذكرة',
    date: 'التاريخ',
    plate: 'الترقيم',
    driver: 'السائق',
    product: 'المنتج',
    quantity: 'الكمية المقدّرة',
    partner: 'الطرف',
    bl: 'رقم البيان',
    from: 'المصدر',
    to: 'الوجهة',
    gross: 'الوزن الإجمالي',
    tare: 'الوزن الفارغ',
    net: 'صافي المنتج',
    supposed: 'الوزن المقدّر',
    gap: 'الفرق',
    ok: 'مطابق',
    out: 'خارج التسامح',
    operator: 'المشغّل',
    station: 'المحطة',
    outside: 'خارجي',
    cancelled: 'تذكرة ملغاة',
    retour: 'مرتجع',
    vrac: 'بالجملة',
    vracPending: 'على التجاري إعداد وصل التسليم',
    quantityVrac: 'الكمية الموزونة',
    primaryTitle: 'تذكرة الوزن رقم 1 — غير مكتملة',
    waitingSecond: 'في انتظار الوزن الثاني',
    manualLegend: 'M = وزن يدوي',
    types: {
      ENTREE: 'تذكرة دخول',
      SORTIE: 'تذكرة خروج',
      TRANSFERT: 'تذكرة تحويل',
      TIERS: 'وزن الغير'
    },
    firstWeigh: 'الوزن الأول',
    secondWeigh: 'الوزن الثاني',
    tagline: 'نرتقي بالجودة معاً'
  }
}

/** Les dates arrivent en `YYYY-MM-DD HH:MM:SS` (mysql2 en dateStrings). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : value
}

function kg(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(3)
}

/** Repère imprimé à côté d'un poids saisi à la main : « M ». */
const MANUAL_MARK = ' <b class="m">M</b>'

function row(
  label: string,
  value: string | null | undefined,
  strong = false,
  manual = false
): string {
  if (value == null || value === '') return ''
  return `<div class="row${strong ? ' strong' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}${manual ? MANUAL_MARK : ''}</span></div>`
}

export function buildTicketHtml(
  op: Operation,
  opts: { company: string; locations: Location[]; lang: Lang; logoDataUri?: string }
): string {
  const t = LABELS[opts.lang]
  const place = (id: number | null | undefined): string => {
    if (id == null) return t.outside
    const found = opts.locations.find((l) => l.id === id)
    return found ? found.name : t.outside
  }

  const weighing = (w: Operation['first'], index: number): string => {
    if (!w) return ''
    return `<div class="weigh">
      <div class="row"><span>${escapeHtml(index === 1 ? t.firstWeigh : t.secondWeigh)}</span><span>${escapeHtml(formatDateTime(w.at))}</span></div>
      <div class="weight">${escapeHtml(kg(w.weight))} kg${w.isManual ? MANUAL_MARK : ''}</div>
    </div>`
  }

  const gapLine =
    op.ecart == null
      ? ''
      : row(
          t.gap,
          `${kg(op.ecart)} kg${op.ecartOk == null ? '' : op.ecartOk ? ` — ${t.ok}` : ` — ${t.out}`}`
        )

  // Seuls les lieux que ce type de ticket demande à l'opérateur sont imprimés :
  // une sortie ne mentionne ni origine ni destination, une entrée seulement l'arrivée.
  const fields = locationFieldsFor(op.type, op.isRetour)
  const title = op.isRetour
    ? `${t.types[op.type]} — ${t.retour}`
    : op.isVrac
      ? `${t.types[op.type]} — ${t.vrac}`
      : t.types[op.type]

  const cancelled =
    op.status === 'ANNULEE' ? `<h2 class="cancelled">${escapeHtml(t.cancelled)}</h2>` : ''

  const logo = opts.logoDataUri
    ? `<img class="brand-logo" src="${escapeHtml(opts.logoDataUri)}" alt="CASPM — Complexe Avicole">`
    : ''
  const companyName = opts.company.trim().toLocaleLowerCase() === 'caspm' ? '' : opts.company.trim()
  const company = companyName ? `<div class="company-name">${escapeHtml(companyName)}</div>` : ''
  const plate = op.plate
    ? `<section class="plate-card"><span>${escapeHtml(t.plate)}</span><strong class="plate-value">${escapeHtml(op.plate)}</strong></section>`
    : ''

  // Un ticket primaire n'a qu'une pesée : pas de net ni d'écart à montrer, et
  // c'est écrit noir sur blanc pour que personne ne lise le bon n° 1 comme un
  // ticket final.
  const isPrimary = op.second == null

  const linesBlock =
    op.lines.length === 0
      ? ''
      : `<div class="lines">
    <div class="row strong"><span>${escapeHtml(t.product)}</span><span>${escapeHtml(op.isVrac ? t.quantityVrac : t.quantity)}</span></div>
    ${op.lines
      .map(
        (l) =>
          `<div class="row"><span>${escapeHtml(l.productCode)}</span><span>${escapeHtml(kg(l.quantityKg))} kg</span></div>`
      )
      .join('')}
  </div>`

  // Vrac pesé, BL pas encore établi : le commercial lit ce bandeau sur le ticket
  // qu'on lui remet, et le net ci-dessous est la quantité à facturer.
  const vracNotice =
    op.isVrac && !isPrimary && !op.blNo?.trim() && op.status !== 'ANNULEE'
      ? `<div class="waiting">${escapeHtml(t.vracPending)}</div>`
      : ''

  const totals = isPrimary
    ? `<div class="waiting">${escapeHtml(t.waitingSecond)}</div>`
    : `<hr>
  ${row(t.gross, `${kg(op.grossWeight)} kg`, false, isManualKind(op, 'BRUT'))}
  ${row(t.tare, `${kg(op.tareWeight)} kg`, false, isManualKind(op, 'TARE'))}
  <div class="row strong net"><span>${escapeHtml(t.net)}</span><span>${escapeHtml(kg(op.netWeight))} kg</span></div>
  ${row(t.supposed, op.weightSupposed == null ? null : `${kg(op.weightSupposed)} kg`)}
  ${gapLine}`

  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(op.ticketNo)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font: 12px/1.35 "Segoe UI", Tahoma, Arial, sans-serif; }
  .ticket-paper { width: 100%; max-width: 72mm; margin: 0 auto; padding: 0 1mm; }
  .ticket-header { text-align: center; padding-bottom: 3mm; border-bottom: 1px solid #555; }
  .brand-logo { display: block; width: min(54mm, 100%); max-height: 18mm; object-fit: contain; margin: 0 auto 2mm; }
  .company-name { font-size: 11px; font-weight: 700; }
  .tagline { font-size: 9px; font-style: italic; }
  .website { font-size: 9px; letter-spacing: .2px; }
  h1 { font-size: 13px; margin: 3mm 0 1mm; text-align: center; letter-spacing: .3px; }
  h2 { font-size: 11px; margin: 2mm 0 1mm; text-align: center; }
  h2.cancelled, h2.primary { border: 1px solid #333; padding: 2mm; margin: 2mm 0; }
  .no { text-align: center; font-size: 17px; font-weight: 800; margin: 1mm 0 2mm; font-variant-numeric: tabular-nums; }
  .plate-card { display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 2mm; margin: 2mm 0; border: 1px solid #333; text-align: center; }
  .plate-card span { font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .plate-value { font-size: 17px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; padding: 1mm 0; }
  .row span { min-width: 0; overflow-wrap: anywhere; }
  .row span:last-child { text-align: ${opts.lang === 'ar' ? 'left' : 'right'}; font-weight: 600; }
  .row.strong { font-weight: 700; }
  .lines, .weigh { border-top: 1px solid #777; margin-top: 2mm; padding-top: 1mm; }
  .weight { text-align: center; font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .waiting { text-align: center; font-weight: 800; border: 1px solid #333; padding: 2mm; margin-top: 2mm; }
  hr { border: 0; border-top: 1px solid #333; margin: 2mm 0; }
  .net { font-size: 19px; border: 2px solid #111; padding: 2mm; margin-top: 2mm; }
  .m { border: 1px solid #000; border-radius: 2px; padding: 0 3px; font-size: 10px; }
  .legend { text-align: center; font-size: 9px; margin-top: 2mm; }
  @media screen { body { background: #fff; } .ticket-paper { padding: 3mm; } }
</style>
</head>
<body>
<main class="ticket-paper">
  <header class="ticket-header">${logo}${company}<div class="tagline">${escapeHtml(t.tagline)}</div><div class="website">caspm.dz</div></header>
  <h2>${escapeHtml(title)}</h2>
  <div class="no">${escapeHtml(op.ticketNo)}</div>
  ${isPrimary ? `<h2 class="primary">${escapeHtml(t.primaryTitle)}</h2>` : ''}
  ${cancelled}
  ${row(t.date, formatDateTime(op.createdAt))}
  ${plate}
  ${row(t.driver, op.driverName)}
  ${linesBlock}
  ${row(t.partner, op.partnerName)}
  ${row(t.bl, op.blNo)}
  ${asksFrom(fields) ? row(t.from, place(op.locationFromId)) : ''}
  ${asksTo(fields) ? row(t.to, place(op.locationToId)) : ''}
  ${weighing(op.first, 1)}
  ${weighing(op.second, 2)}
  ${totals}
  ${vracNotice}
  ${op.first?.isManual || op.second?.isManual ? `<div class="legend">${escapeHtml(t.manualLegend)}</div>` : ''}
  <hr>
  ${row(t.operator, op.operatorName)}
  ${op.status === 'ANNULEE' && op.cancelReason ? row(t.cancelled, op.cancelReason) : ''}
</main>
</body>
</html>`
}

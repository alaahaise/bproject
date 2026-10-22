/**
 * Récapitulatif d'un enlèvement vrac, imprimable sur rouleau 80 mm : c'est le
 * papier remis au commercial pour établir le BL. Il liste chaque rotation (un
 * ticket) et le total à facturer.
 *
 * Même règles que ticket-html.ts : un seul gabarit pour l'aperçu et le papier,
 * et tout ce qui vient de la base est échappé.
 */
import type { Lang } from '@shared/channels'
import { isGroupBlPending } from '@shared/domain/vrac'
import type { VracGroup } from '@shared/types'
import { escapeHtml, formatDateTime } from './ticket-html'

interface Labels {
  title: string
  provisional: string
  closed: string
  date: string
  partner: string
  plate: string
  rotation: string
  gross: string
  tare: string
  net: string
  total: string
  rotations: string
  product: string
  bl: string
  pending: string
  waiting: string
  cancelled: string
}

const LABELS: Record<Lang, Labels> = {
  fr: {
    title: 'ENLÈVEMENT VRAC',
    provisional: 'PROVISOIRE — enlèvement non clôturé',
    closed: 'Clôturé le',
    date: 'Début',
    partner: 'Client',
    plate: 'Camion',
    rotation: 'Rotation',
    gross: 'Brut',
    tare: 'Tare',
    net: 'Net',
    total: 'TOTAL NET À FACTURER',
    rotations: 'Rotations',
    product: 'Produit',
    bl: 'N° BL',
    pending: 'BL À ÉTABLIR PAR LE COMMERCIAL',
    waiting: '2e pesée attendue',
    cancelled: 'Annulée'
  },
  ar: {
    title: 'شحن بالجملة',
    provisional: 'مؤقت — الشحن لم يُغلق بعد',
    closed: 'أُغلق في',
    date: 'البداية',
    partner: 'الزبون',
    plate: 'الشاحنة',
    rotation: 'الرحلة',
    gross: 'القائم',
    tare: 'الفارغ',
    net: 'الصافي',
    total: 'مجموع الصافي للفوترة',
    rotations: 'الرحلات',
    product: 'المنتج',
    bl: 'رقم الوصل',
    pending: 'على التجاري إعداد وصل التسليم',
    waiting: 'الوزن الثاني مطلوب',
    cancelled: 'ملغاة'
  }
}

function kg(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(3)
}

function row(label: string, value: string | null | undefined, strong = false): string {
  if (value == null || value === '') return ''
  return `<div class="row${strong ? ' strong' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
}

export function buildVracGroupHtml(group: VracGroup, opts: { company: string; lang: Lang }): string {
  const t = LABELS[opts.lang]

  const rotations = group.rotations
    .map((r, index) => {
      const status = r.status === 'ANNULEE' ? t.cancelled : r.weighed ? '' : t.waiting
      return `<div class="rot${r.status === 'ANNULEE' ? ' off' : ''}">
      <div class="row strong"><span>${escapeHtml(`${t.rotation} ${index + 1} — ${r.ticketNo}`)}</span><span>${escapeHtml(r.weighed && r.status !== 'ANNULEE' ? `${kg(r.netWeight)} kg` : status)}</span></div>
      ${r.plate ? `<div class="sub">${escapeHtml(t.plate)} ${escapeHtml(r.plate)}${r.weighed ? ` · ${escapeHtml(t.gross)} ${escapeHtml(kg(r.grossWeight))} · ${escapeHtml(t.tare)} ${escapeHtml(kg(r.tareWeight))}` : ''}</div>` : ''}
    </div>`
    })
    .join('')

  const products =
    group.products.length === 0
      ? ''
      : `<div class="block">
    <div class="row strong"><span>${escapeHtml(t.product)}</span><span>${escapeHtml(t.net)}</span></div>
    ${group.products.map((p) => `<div class="row"><span>${escapeHtml(p.productCode)}</span><span>${escapeHtml(kg(p.quantityKg))} kg</span></div>`).join('')}
  </div>`

  const banner =
    group.status === 'OUVERT'
      ? `<div class="waiting">${escapeHtml(t.provisional)}</div>`
      : isGroupBlPending(group)
        ? `<div class="waiting">${escapeHtml(t.pending)}</div>`
        : ''

  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(group.reference)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 12px; width: 72mm; margin: 0; color: #000; }
  h1 { font-size: 14px; margin: 0; text-align: center; letter-spacing: .5px; }
  h2 { font-size: 13px; margin: 6px 0 2px; text-align: center; }
  .no { text-align: center; font-size: 15px; font-weight: 700; margin: 2px 0 6px; }
  .row { display: flex; justify-content: space-between; gap: 6px; padding: 1px 0; }
  .row span:last-child { text-align: ${opts.lang === 'ar' ? 'left' : 'right'}; font-weight: 600; white-space: nowrap; }
  .row.strong { font-weight: 700; }
  .rot { border-top: 1px dashed #000; padding: 3px 0; }
  .rot.off { text-decoration: line-through; opacity: .6; }
  .sub { font-size: 10px; }
  .block { border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px; }
  .waiting { text-align: center; font-weight: 700; border: 1px dashed #000; padding: 4px; margin-top: 6px; }
  hr { border: 0; border-top: 1px solid #000; margin: 6px 0; }
  .total { font-size: 16px; }
  .big { text-align: center; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>${escapeHtml(opts.company)}</h1>
  <h2>${escapeHtml(t.title)}</h2>
  <div class="no">${escapeHtml(group.reference)}</div>
  ${row(t.date, formatDateTime(group.createdAt))}
  ${group.closedAt ? row(t.closed, formatDateTime(group.closedAt)) : ''}
  ${row(t.partner, group.partnerName)}
  ${row(t.bl, group.blNo)}
  <div class="block"><div class="row strong"><span>${escapeHtml(t.rotations)}</span><span>${group.weighedCount}</span></div></div>
  ${rotations}
  ${products}
  <hr>
  <div class="row strong total"><span>${escapeHtml(t.total)}</span></div>
  <div class="big">${escapeHtml(kg(group.totalNetKg))} kg</div>
  ${banner}
</body>
</html>`
}

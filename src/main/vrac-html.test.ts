import { describe, expect, it } from 'vitest'
import { summarizeVracGroup } from '@shared/domain/vrac'
import type { VracRotation } from '@shared/types'
import { buildVracGroupHtml } from './vrac-html'

const rotation = (over: Partial<VracRotation> = {}): VracRotation => ({
  operationId: 1,
  ticketNo: 'S-2026-000010',
  plate: '12345-116-16',
  status: 'FERMEE',
  productCode: 'Maïs vrac',
  grossWeight: 34150,
  tareWeight: 8400,
  netWeight: 25750,
  weighed: true,
  partnerName: 'HANGAR AIN NOUISSY',
  blNo: null,
  blDate: null,
  createdAt: '2026-10-21 08:00:00',
  ...over
})

const group = (status: 'OUVERT' | 'CLOS', rotations: VracRotation[]) =>
  summarizeVracGroup(
    { id: 5, status, createdAt: '2026-10-21 08:00:00', closedAt: status === 'CLOS' ? '2026-10-21 17:00:00' : null },
    rotations
  )

const four = [
  rotation({ operationId: 1, ticketNo: 'S-2026-000010', netWeight: 25750 }),
  rotation({ operationId: 2, ticketNo: 'S-2026-000011', netWeight: 26100 }),
  rotation({ operationId: 3, ticketNo: 'S-2026-000012', netWeight: 25900 }),
  rotation({ operationId: 4, ticketNo: 'S-2026-000013', netWeight: 26250 })
]

describe('buildVracGroupHtml', () => {
  it('liste chaque rotation et le total à facturer', () => {
    const html = buildVracGroupHtml(group('CLOS', four), { company: 'ACME', lang: 'fr' })

    expect(html).toContain('ENLÈVEMENT VRAC')
    for (const no of ['S-2026-000010', 'S-2026-000011', 'S-2026-000012', 'S-2026-000013']) {
      expect(html).toContain(no)
    }
    expect(html).toContain('104000.000 kg')
    expect(html).toContain('TOTAL NET À FACTURER')
    expect(html).toContain('HANGAR AIN NOUISSY')
  })

  it('porte « BL à établir » une fois clôturé et tant que le BL manque', () => {
    const html = buildVracGroupHtml(group('CLOS', four), { company: 'ACME', lang: 'fr' })
    expect(html).toContain('BL À ÉTABLIR PAR LE COMMERCIAL')
    expect(html).not.toContain('PROVISOIRE')
  })

  it('est marqué provisoire tant que l’enlèvement est ouvert', () => {
    const html = buildVracGroupHtml(group('OUVERT', four), { company: 'ACME', lang: 'fr' })
    expect(html).toContain('PROVISOIRE')
    expect(html).not.toContain('BL À ÉTABLIR')
  })

  it('imprime le BL et retire le bandeau une fois établi', () => {
    const withBl = four.map((r) => ({ ...r, blNo: 'BL26-05255' }))
    const html = buildVracGroupHtml(group('CLOS', withBl), { company: 'ACME', lang: 'fr' })
    expect(html).toContain('BL26-05255')
    expect(html).not.toContain('BL À ÉTABLIR')
  })

  it("n'additionne pas une rotation annulée et la barre", () => {
    const html = buildVracGroupHtml(
      group('OUVERT', [...four, rotation({ operationId: 5, ticketNo: 'S-2026-000014', status: 'ANNULEE', netWeight: 9999 })]),
      { company: 'ACME', lang: 'fr' }
    )
    expect(html).toContain('104000.000 kg')
    expect(html).toContain('Annulée')
    expect(html).toContain('line-through')
  })

  it('échappe ce qui vient de la base', () => {
    const html = buildVracGroupHtml(
      group('CLOS', [rotation({ partnerName: '<script>alert(1)</script>', productCode: '<b>x</b>' })]),
      { company: 'ACME', lang: 'fr' }
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<b>x</b>')
  })

  it("s'imprime en arabe, de droite à gauche", () => {
    const html = buildVracGroupHtml(group('CLOS', four), { company: 'ACME', lang: 'ar' })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('شحن بالجملة')
  })
})

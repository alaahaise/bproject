import { useEffect, useState } from 'react'
import { normalizePlate } from '@shared/domain/plate'
import type { VracGroup } from '@shared/types'
import { api, call, formatKg } from '../api'
import { useI18n } from '../i18n'
import Field from './Field'

/**
 * Choix de l'enlèvement d'une rotation vrac : un nouvel enlèvement, ou l'un de
 * ceux encore ouverts (la rotation suivante du même client).
 *
 * Quand le camion a déjà une rotation dans exactement un enlèvement ouvert, ce
 * dernier est proposé d'office : c'est le cas courant (le même camion revient).
 */
export default function VracGroupPicker({
  plate,
  value,
  onChange,
  disabled = false
}: {
  plate: string
  /** null = nouvel enlèvement. */
  value: number | null
  onChange: (groupId: number | null) => void
  disabled?: boolean
}) {
  const { t, lang } = useI18n()
  const [groups, setGroups] = useState<VracGroup[]>([])
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    let alive = true
    call(api.vrac.groups({ status: 'OUVERT' }))
      .then((list) => alive && setGroups(list))
      .catch(() => alive && setGroups([]))
    return () => {
      alive = false
    }
  }, [])

  // Même camion que l'une des rotations d'un seul enlèvement ouvert : on le propose,
  // tant que l'opérateur n'a pas fait son propre choix.
  useEffect(() => {
    if (touched) return
    const key = normalizePlate(plate)
    if (key === '') return
    const matches = groups.filter((group) =>
      group.rotations.some((r) => r.plate != null && normalizePlate(r.plate) === key)
    )
    onChange(matches.length === 1 ? (matches[0]?.id ?? null) : null)
    // `onChange` est un setState côté appelant : seul le contexte (camion, liste) compte ici.
  }, [plate, groups, touched])

  return (
    <Field label={t('vracGroup.picker')} hint={t('vracGroup.pickerHint')}>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          setTouched(true)
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }}
      >
        <option value="">{t('vracGroup.new')}</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {t('vracGroup.option', {
              ref: group.reference,
              partner: group.partnerName ?? '—',
              count: String(group.weighedCount),
              total: `${formatKg(group.totalNetKg, lang)}`
            })}
          </option>
        ))}
      </select>
    </Field>
  )
}

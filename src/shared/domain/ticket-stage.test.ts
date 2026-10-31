import { describe, expect, it } from 'vitest'
import { ticketStage } from './ticket-stage'

const weighing = { weight: 1000, at: '2026-10-28T10:00:00' }

describe('ticketStage', () => {
  it('un ticket ouvert pesé une fois attend la 2e pesée', () => {
    expect(ticketStage({ status: 'OUVERTE', second: null })).toBe('waiting')
  })

  it('un ticket ouvert pesé deux fois attend l’enregistrement', () => {
    expect(ticketStage({ status: 'OUVERTE', second: weighing })).toBe('toSave')
  })

  it('un ticket fermé est terminé, qu’il ait une 2e pesée ou non', () => {
    expect(ticketStage({ status: 'FERMEE', second: weighing })).toBe('done')
    expect(ticketStage({ status: 'FERMEE', second: null })).toBe('done')
  })

  it('un ticket annulé reste annulé, même pesé deux fois', () => {
    expect(ticketStage({ status: 'ANNULEE', second: weighing })).toBe('cancelled')
  })
})

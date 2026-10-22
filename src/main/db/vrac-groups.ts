/**
 * Enlèvements vrac : plusieurs rotations (tickets) d'un même client, sommées pour
 * établir un seul BL.
 *
 * Règles portées ici :
 *  - un enlèvement OUVERT accepte de nouvelles rotations, un CLOS non ;
 *  - on ne clôture pas tant qu'une rotation attend sa 2e pesée (son net manquerait
 *    au total remis au commercial) ;
 *  - le BL est enregistré sur toutes les rotations à la fois, pour qu'aucune ne
 *    reste « à établir » ;
 *  - le total est calculé (somme des nets), jamais stocké.
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { VracGroupFilter, VracLinkBlInput } from '@shared/channels'
import { containsPattern, searchKey } from '@shared/domain/search'
import { closeBlocker, summarizeVracGroup } from '@shared/domain/vrac'
import type { OperationStatus, SessionUser, VracGroup, VracRotation } from '@shared/types'
import { getPool } from './pool'
import { stripped } from './search-sql'

const LIST_LIMIT = 100

const BLOCKER_MESSAGE = {
  ALREADY_CLOSED: 'Cet enlèvement est déjà clôturé',
  NO_ROTATION: 'Aucune rotation pesée : rien à clôturer',
  AWAITING_SECOND: 'Une rotation attend encore sa 2e pesée : terminez-la ou annulez-la avant de clôturer'
} as const

function num(value: unknown): number | null {
  return value == null ? null : Number(value)
}

function toRotation(row: RowDataPacket): VracRotation {
  return {
    operationId: Number(row.id),
    ticketNo: String(row.ticket_no),
    plate: row.plate ?? null,
    status: row.status as OperationStatus,
    productCode: row.product_code ?? null,
    grossWeight: num(row.gross_weight),
    tareWeight: num(row.tare_weight),
    netWeight: num(row.net_weight),
    weighed: row.second_weight != null,
    partnerName: row.partner_name ?? null,
    blNo: row.bl_no ?? null,
    blDate: row.bl_date ?? null,
    createdAt: String(row.created_at)
  }
}

async function loadGroups(ids: number[]): Promise<VracGroup[]> {
  if (ids.length === 0) return []
  const pool = getPool()
  const [groupRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, status, created_at, closed_at FROM vrac_groups WHERE id IN (?)',
    [ids]
  )
  const [rotationRows] = await pool.query<RowDataPacket[]>(
    `SELECT o.vrac_group_id AS group_id, o.id, o.ticket_no, o.plate, o.status,
            o.gross_weight, o.tare_weight, o.net_weight, o.second_weight,
            o.partner_name, o.bl_no, o.bl_date, o.created_at,
            (SELECT l.product_code FROM operation_lines l
              WHERE l.operation_id = o.id ORDER BY l.position, l.id LIMIT 1) AS product_code
       FROM operations o
      WHERE o.vrac_group_id IN (?)
      ORDER BY o.id`,
    [ids]
  )

  const byGroup = new Map<number, VracRotation[]>()
  for (const row of rotationRows) {
    const key = Number(row.group_id)
    byGroup.set(key, [...(byGroup.get(key) ?? []), toRotation(row)])
  }

  const byId = new Map(groupRows.map((row) => [Number(row.id), row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    return [
      summarizeVracGroup(
        {
          id,
          status: row.status,
          createdAt: String(row.created_at),
          closedAt: row.closed_at ? String(row.closed_at) : null
        },
        byGroup.get(id) ?? []
      )
    ]
  })
}

export async function getGroup(id: number): Promise<VracGroup | null> {
  return (await loadGroups([id]))[0] ?? null
}

export async function listGroups(filter: VracGroupFilter = {}): Promise<VracGroup[]> {
  const where: string[] = []
  const params: unknown[] = []

  if (filter.status) {
    where.push('g.status = ?')
    params.push(filter.status)
  }
  if (filter.blPending) {
    // Même définition que `isGroupBlPending` : une rotation pesée, aucun BL.
    where.push(
      `EXISTS (SELECT 1 FROM operations o WHERE o.vrac_group_id = g.id
                AND o.status <> 'ANNULEE' AND o.second_weight IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM operations o WHERE o.vrac_group_id = g.id
                AND o.status <> 'ANNULEE' AND o.bl_no IS NOT NULL AND o.bl_no <> '')`
    )
  }
  if (filter.search) {
    // Comme la recherche de tickets : texte tel quel, et forme tolérante pour le
    // numéro de ticket et le matricule (« 12345 116 16 » = « 12345-116-16 »).
    const like = containsPattern(filter.search)
    const clauses = ['o.ticket_no LIKE ?', 'o.plate LIKE ?', 'o.partner_name LIKE ?', 'o.bl_no LIKE ?']
    params.push(like, like, like, like)
    const key = searchKey(filter.search)
    if (key !== '') {
      const keyLike = containsPattern(key)
      for (const column of ['o.ticket_no', 'o.plate']) {
        clauses.push(`${stripped(column)} LIKE ?`)
        params.push(keyLike)
      }
    }
    where.push(
      `EXISTS (SELECT 1 FROM operations o WHERE o.vrac_group_id = g.id AND (${clauses.join(' OR ')}))`
    )
  }

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT g.id FROM vrac_groups g
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY g.status = 'OUVERT' DESC, g.id DESC
      LIMIT ${LIST_LIMIT}`,
    params
  )
  return loadGroups(rows.map((row) => Number(row.id)))
}

/**
 * Rattache une nouvelle rotation à un enlèvement OUVERT, ou en crée un. Appelé dans
 * la transaction de création du ticket.
 */
export async function assignGroup(
  conn: PoolConnection,
  requestedId: number | null | undefined
): Promise<number> {
  if (requestedId == null) {
    const [created] = await conn.query<ResultSetHeader>(
      "INSERT INTO vrac_groups (status) VALUES ('OUVERT')"
    )
    return created.insertId
  }

  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT status FROM vrac_groups WHERE id = ? FOR UPDATE',
    [requestedId]
  )
  const row = rows[0]
  if (!row) throw new Error('Enlèvement introuvable')
  if (row.status !== 'OUVERT') throw new Error('Cet enlèvement est clôturé : créez un nouvel enlèvement')
  return requestedId
}

/** Un enlèvement resté sans aucun ticket (rotation déclassée en non-vrac) disparaît. */
export async function dropGroupIfEmpty(conn: PoolConnection, groupId: number): Promise<void> {
  await conn.query(
    `DELETE FROM vrac_groups
      WHERE id = ? AND NOT EXISTS (SELECT 1 FROM operations WHERE vrac_group_id = ?)`,
    [groupId, groupId]
  )
}

/** Le BL d'une rotation est celui de l'enlèvement : on l'étend aux autres rotations. */
export async function shareBlInGroup(
  conn: PoolConnection,
  groupId: number,
  exceptOperationId: number,
  blNo: string | null,
  blDate: string | null
): Promise<void> {
  await conn.query(
    `UPDATE operations SET bl_no = ?, bl_date = ?
      WHERE vrac_group_id = ? AND id <> ? AND status <> 'ANNULEE'`,
    [blNo, blDate, groupId, exceptOperationId]
  )
}

async function audit(
  conn: PoolConnection,
  user: SessionUser,
  action: string,
  groupId: number,
  after: unknown
): Promise<void> {
  await conn.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, after_json) VALUES (?,?,?,?,?)`,
    [user.id, action, 'vrac_groups', String(groupId), JSON.stringify(after)]
  )
}

async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

async function requireGroup(id: number): Promise<VracGroup> {
  const group = await getGroup(id)
  if (!group) throw new Error('Enlèvement introuvable')
  return group
}

export async function closeGroup(id: number, user: SessionUser): Promise<VracGroup> {
  await inTransaction(async (conn) => {
    // Verrou : deux clics, ou un autre poste qui ajoute une rotation au même instant.
    await conn.query('SELECT id FROM vrac_groups WHERE id = ? FOR UPDATE', [id])
    const blocker = closeBlocker(await requireGroup(id))
    if (blocker) throw new Error(BLOCKER_MESSAGE[blocker])

    await conn.query(
      "UPDATE vrac_groups SET status = 'CLOS', closed_at = NOW(), closed_by = ? WHERE id = ?",
      [user.id, id]
    )
    await audit(conn, user, 'VRAC_CLOSE', id, {})
  })
  return requireGroup(id)
}

export async function reopenGroup(id: number, user: SessionUser): Promise<VracGroup> {
  await inTransaction(async (conn) => {
    await conn.query('SELECT id FROM vrac_groups WHERE id = ? FOR UPDATE', [id])
    const group = await requireGroup(id)
    if (group.status !== 'CLOS') throw new Error('Cet enlèvement est déjà ouvert')
    // Le BL a été établi sur le total : y ajouter une rotation le rendrait faux.
    if (group.blNo) throw new Error('Un BL est déjà renseigné : on ne peut plus rouvrir cet enlèvement')

    await conn.query(
      "UPDATE vrac_groups SET status = 'OUVERT', closed_at = NULL, closed_by = NULL WHERE id = ?",
      [id]
    )
    await audit(conn, user, 'VRAC_REOPEN', id, {})
  })
  return requireGroup(id)
}

export async function linkBl(input: VracLinkBlInput, user: SessionUser): Promise<VracGroup> {
  const blNo = input.blNo.trim()
  const blDate = input.blDate?.trim() || null

  await inTransaction(async (conn) => {
    await conn.query('SELECT id FROM vrac_groups WHERE id = ? FOR UPDATE', [input.id])
    const group = await requireGroup(input.id)
    if (group.weighedCount === 0) throw new Error('Aucune rotation pesée : pas de BL à rattacher')
    if (group.status !== 'CLOS') {
      throw new Error('Clôturez l’enlèvement avant de rattacher le BL')
    }

    await conn.query(
      `UPDATE operations SET bl_no = ?, bl_date = ?
        WHERE vrac_group_id = ? AND status <> 'ANNULEE'`,
      [blNo, blDate, input.id]
    )
    const partner = input.partnerName?.trim()
    if (partner) {
      await conn.query(
        `UPDATE operations SET partner_name = ?
          WHERE vrac_group_id = ? AND status <> 'ANNULEE'
            AND (partner_name IS NULL OR partner_name = '')`,
        [partner.slice(0, 160), input.id]
      )
    }
    await audit(conn, user, 'VRAC_LINK_BL', input.id, { blNo, blDate })
  })
  return requireGroup(input.id)
}

/**
 * Outils en ligne de commande pour tester le service contre la vraie base HFSQL.
 *
 *   npm run bl:probe [BL26-05255]   vérifie connexion, en-tête, client, lignes, poids
 *   npm run bl:export [BL26-05255]  écrit samples/ (JSON complet + champs + schéma)
 *
 * Lecture seule. samples/ contient des données réelles et est ignoré par git.
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBlInput } from '@shared/domain/bl-number'
import { loadConfig, maskConnectionString } from './config'
import { createDb } from './db'
import { createBlService } from './bl-service'
import { createSchema, type SchemaMap } from './schema'
import { isAmbiguous } from './types'

const DEFAULT_BL = 'BL26-05255'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\r?\n/g, ' ').slice(0, 180).replace(/\|/g, '\\|')
}

function section(
  title: string,
  row: Record<string, unknown> | null,
  table: string,
  tables: SchemaMap
): string {
  const byName = new Map((tables[table] ?? []).map((column) => [column.name, column]))
  const lines = [
    `## ${title}`,
    '',
    '| Champ | Type | Description HFSQL | Valeur |',
    '| --- | --- | --- | --- |'
  ]
  for (const [key, value] of Object.entries(row ?? {})) {
    const column = byName.get(key)
    lines.push(`| \`${key}\` | ${column?.type ?? ''} | ${cell(column?.remarks)} | ${cell(value)} |`)
  }
  return lines.join('\n')
}

async function run(): Promise<number> {
  const [command = 'probe', reference = DEFAULT_BL] = process.argv.slice(2)
  if (command !== 'probe' && command !== 'export') {
    console.error('Usage : bl-cli <probe|export> [numéro de BL]')
    return 2
  }

  const config = loadConfig()
  const db = createDb(config)
  const schema = createSchema(db)
  const service = createBlService(db, schema, config)

  try {
    console.log(`Connexion : ${maskConnectionString(config.connectionString)}`)
    const result = await service.getBl(parseBlInput(reference), { full: command === 'export' })

    if (!result) {
      console.error(`Aucun BL trouvé pour « ${reference} ».`)
      return 1
    }
    if (isAmbiguous(result)) {
      console.error(`Numéro ambigu : ${result.candidates.map((c) => c.reference).join(', ')}`)
      return 1
    }

    const { bl, lines } = result
    console.log(`\n${bl.reference} — ${bl.date ?? 'sans date'} — client : ${bl.client?.name ?? '—'}`)
    for (const line of lines) {
      console.log(
        `  ${line.code ?? '?'}  ${line.name ?? ''}  qté ${line.quantity ?? '—'}  → ` +
          `${line.weightKg ?? 'poids inconnu'} kg (${line.weightSource ?? '—'})`
      )
    }
    console.log(
      `Poids total : ${bl.totalWeightKg ?? 'incomplet'} kg ` +
        `(connu ${bl.knownWeightKg} kg, lignes sans poids : ${bl.unknownWeightLines})`
    )

    if (command === 'export' && result.full) {
      const out = join(process.cwd(), 'samples')
      mkdirSync(out, { recursive: true })
      const tables = await schema.summary()
      const md = [
        `# ${bl.reference} — tous les champs disponibles`,
        '',
        `${lines.length} ligne(s).`,
        '',
        section('En-tête du BL — Mouvement', result.full.header, 'Mouvement', tables),
        '',
        section('Client — Tiers', result.full.client, 'Tiers', tables),
        ''
      ]
      result.full.lines.forEach((entry, index) => {
        md.push(section(`Ligne ${index + 1} — Ligne_MT`, entry.line, 'Ligne_MT', tables), '')
        if (entry.article) md.push(section('Article', entry.article, 'Articles', tables), '')
      })

      writeFileSync(join(out, `${bl.reference}-full.json`), `${JSON.stringify(result, null, 2)}\n`)
      writeFileSync(join(out, 'schema.json'), `${JSON.stringify({ tables }, null, 2)}\n`)
      writeFileSync(join(out, `${bl.reference}-fields.md`), `${md.join('\n')}\n`)
      console.log(`\nÉcrit dans ${out}`)
    }
    return 0
  } finally {
    await db.close()
  }
}

run().then(
  // Sortie explicite : le pilote ODBC peut planter à la fermeture native sous Node 24.
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('ÉCHEC :', error instanceof Error ? error.message : error)
    process.exit(1)
  }
)

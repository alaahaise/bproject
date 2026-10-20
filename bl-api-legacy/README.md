# CASPM — BL lookup API

Read-only Node.js API for the company ERP (HFSQL). An agent enters a BL
(*bon de livraison*) number and gets:

- the BL header (reference, date, status),
- the client (code + name),
- every product line (code, name, quantity, unit price, line total),
- the BL totals,
- the **total weight** (`totalWeightKg`) from a line, unit or article weight,
  or from `Qte` in quintals for finished veterinary products (1 quintal =
  100 kg); it stays `null` when no weight can be resolved, rather than showing
  a misleading partial total,
- optionally **every non-empty HFSQL field** for the BL, client, lines and
  articles (`?full=1`).

Tested against the exported HFSQL Classic files in `DOSSIER/D001`, and ready to
switch to the production HFSQL Client/Server database.

## Requirements

- Node.js >= 20 (developed on Node 24)
- Windows with the **HFSQL 64-bit ODBC driver** installed
- An ODBC DSN with the database password:
  - development: `allaa` (already on this machine)
  - production: `commercial` (points to `192.168.0.120:4900`)

## Setup

```bash
npm install
copy .env.example .env
npm start
```

If npm blocks the `odbc` install script, approve it once and rebuild:

```bash
npm install-scripts approve odbc
npm rebuild odbc
```

Then open <http://localhost:3100> for the test page.

### `.env`

```ini
# Local HFSQL Classic copy
HFSQL_CONN=DSN=allaa;RepFic=C:\Users\Admin\Documents\project\DOSSIER\D001\

# Production HFSQL Client/Server
# HFSQL_CONN=DSN=commercial

PORT=3100
# Optional: bind the standalone API to one interface (default: all interfaces)
# HOST=127.0.0.1
BL_TYPE=23
ARTICLE_CACHE_TTL_MS=60000
```

The `RepFic` override only changes the data directory; the password still comes
from the `allaa` DSN (`PWDXX`). Do not commit `.env`.

## API

### `GET /api/bl/:number`

Accepted inputs:

| Input | Meaning |
|---|---|
| `BL26-05255` | exact reference |
| `BL2605255` | reference without separator |
| `BL26/05255` | slashes are ignored |
| `BL2026-05255` | four-digit year |
| `BL202605255` | four-digit year, compact |
| `26-05255` | year + number |
| `2605255` | year + number, compact |
| `5255` | number only (searches all years) |
| `BL 5255` | number only, with the BL prefix |

Optional query parameter: `?year=2025` (2 or 4 digits) to disambiguate a bare
number.

Success (`200`):

```json
{
  "found": true,
  "bl": {
    "id": 39394,
    "reference": "BL26-05255",
    "year": 2026,
    "number": 5255,
    "date": "2026-07-01",
    "time": "10:34:00.000",
    "deliveryDate": "2026-07-01",
    "status": 1,
    "client": {
      "id": 105,
      "code": "78",
      "name": "HANGAR AIN NOUISSY",
      "owner": "SID AHMED MANSOUR",
      "activity": "ELEVEUR",
      "address": null,
      "phone": null,
      "mobile": null,
      "email": null,
      "taxId": null
    },
    "totalHt": 89200,
    "totalTtc": 89200,
    "lineCount": 3,
    "totalWeightKg": 2000,
    "knownWeightKg": 2000,
    "weightComplete": true,
    "unknownWeightLines": 0
  },
  "lines": [
    {
      "lineId": 106511,
      "articleId": 230,
      "code": "VIG 1L",
      "name": "Vigosine 1L",
      "barcode": "VIGOSINE 1L",
      "familyId": 1,
      "subFamilyId": 0,
      "unitId": 13,
      "classification": 5,
      "category": 38,
      "quantity": 2,
      "packages": 2,
      "packaging": 1,
      "quantityVrac": 0,
      "weight": 0,
      "weightKg": 200,
      "unitWeightKg": 100,
      "weightSource": "quintal",
      "lot": null,
      "expiryDate": null,
      "unitPriceHt": 2600,
      "totalHt": 5200
    }
  ]
}
```

Other responses:

- `400` — invalid input
- `404` — no BL with that number
- `409` — number exists in several years; body contains `candidates`
- `500` — database error

### `GET /api/bl/:number?full=1`

Returns the normal response plus a `full` object containing every non-empty
column for the four HFSQL tables around the BL:

```json
{
  "found": true,
  "bl": { "...": "normal response" },
  "lines": ["..."],
  "full": {
    "header": {
      "REFERENCE": "BL26-05255",
      "DATE": "2026-07-01",
      "HEURE": "10:34:00.000",
      "IDTIERS": 105,
      "HT": 89200
    },
    "client": {
      "CODE": "78",
      "LIBELLE": "HANGAR AIN NOUISSY",
      "PROPRIETAIRE": "SID AHMED MANSOUR",
      "ACTIVITE": "ELEVEUR"
    },
    "lines": [
      {
        "line": {
          "IDLIGNE_MT": 106511,
          "IDARTICLE": 230,
          "QTE": 2,
          "NBR_COLIS": 2,
          "COLISAGE": 1
        },
        "article": {
          "REFERENCE": "VIG 1L",
          "LIBELLE": "Vigosine 1L",
          "CODE_BARRES": "VIGOSINE 1L",
          "FAMILLE": 1,
          "UNITE_MESURE": 13
        }
      }
    ]
  }
}
```

Field names in `full` are the physical HFSQL column names (uppercase/ASCII).
Empty values and binary columns (`IMAGE`) are omitted. Use `/api/schema` to
see every column, including empty ones.

The test page has a **Tous les champs** checkbox that requests this mode and
displays the fields grouped by table.

### Weight

Each line exposes both the raw HFSQL line weight and the resolved weight:

- `weight` — raw `Ligne_MT.POIDS` value;
- `weightKg` — resolved line total in kg, or `null` when nothing can be
  resolved;
- `unitWeightKg` — resolved weight of one unit (for the quintal fallback, one
  quintal = 100 kg);
- `weightSource` — `line`, `unit`, `article` or `quintal` (or `null`).

Resolution order:

1. `Ligne_MT.POIDS` (the explicit line total);
2. `Ligne_MT.POIDS_UN × Ligne_MT.Qte` (unit weight);
3. `Articles.POIDS_BRUT × Ligne_MT.Qte` (article master weight);
4. `Ligne_MT.Qte × 100` — finished veterinary products have no weight, and
   their `Qte` is in **quintals** (1 quintal = 100 kg). Example: 2 colis,
   `Qte = 1` → 100 kg.

The BL-level `totalWeightKg` is only filled when **all** lines have a weight.
Otherwise the API returns `weightComplete: false`, `knownWeightKg` for the
partial sum, and `unknownWeightLines`. A missing weight is never converted to
`0 kg`, because the weighbridge would then compare against a false total.

**Local export:** the three weight columns are `0` in `DOSSIER/D001`, but the
quantities are usable. For `BL26-05255`, `Qte` 2 + 6 + 12 = 20 quintals, so the
API returns `totalWeightKg: 2000`. The quintal conversion is the business rule
for finished veterinary products; confirm it on a production BL before relying
on it for a different product family.

### `GET /api/schema`

Returns the column metadata used to build the full dump. Optional `?table=`
filters one table (`Mouvement`, `Ligne_MT`, `Tiers`, `Articles`).

```json
{
  "tables": {
    "Articles": [
      {
        "name": "REFERENCE",
        "position": 5,
        "type": "SQL_CHAR",
        "dataType": 1,
        "size": 30,
        "nullable": false,
        "remarks": "Référence"
      }
    ]
  }
}
```

The `remarks` values are the French descriptions stored in the HFSQL schema.

### `GET /api/health`

```json
{ "ok": true, "database": "connected", "movements": 37856 }
```

## Data mapping (HFSQL)

| Information | Source |
|---|---|
| BL document | `Mouvement` with `Type = 23` (`Type_Pièce`: *Bon de livraison*, prefix `BL`) |
| BL reference | `Mouvement.Référence` (`BL26-05255`) |
| Client | `Mouvement.IdTiers` → `Tiers.IdTiers` |
| Lines | `Ligne_MT.IDMouvement` where `Ligne_MT.Type = 23` |
| Product | `Ligne_MT.IDArticle` → `Articles.IDArticle` |
| Product code | `Articles.Reference` (`Articles.Code` is always empty) |
| Product metadata | `Articles.Code_Barres`, `Famille`, `Sous_Famille`, `Unite_Mesure`, `Classification`, `Categorie` |
| Quantity / packaging | `Ligne_MT.Qte`, `Nbr_Colis`, `Colisage`, `Qte_Vrac`, `Poids` |
| Weight | `Ligne_MT.Poids`, then `Ligne_MT.POIDS_UN × Qte`, then `Articles.Poids_Brut × Qte`, then `Qte × 100` (quintals) |
| Lot / expiry | `Ligne_MT.Ref_Lot`, `Ligne_MT.D_Peremption` (often empty in the local export) |
| Client details | `Tiers.Proprietaire`, `Activite`, `Adr_Facturation`, `Telephone`, `Mobile`, `Email`, `IdentFiscal` |
| Quantity / price | `Ligne_MT.Qte`, `Ligne_MT.Prix_HT`, `Ligne_MT.Résultat_HT` |
| Totals | `Mouvement.HT`, `Mouvement.TTC` (falls back to the sum of lines) |

The API uses ASCII identifier spellings (`Reference`, `Annee`, `Numero`,
`Libelle`, `Prix_HT`, …). The HFSQL ODBC driver resolves them to the accented
names.

Full mode builds an explicit `SELECT` list from the ODBC column metadata. This
is required because the HFSQL driver returns **zero rows** for
`SELECT * FROM Articles`; selecting the `IMAGE` binary column also makes the
driver return zero rows. Binary columns are therefore excluded from full mode.

## Why SQL is built as text

The HFSQL ODBC driver used on this machine does not support `?` parameter
markers. All values are validated first:

- the BL number is parsed into a restricted reference or integer year/number,
- IDs are integers,
- strings are escaped through `src/sql.js`.

Only `SELECT` statements are issued. The API never writes to HFSQL.

## Going to production

1. Join the company network (or run the API on a LAN machine).
2. Set `HFSQL_CONN=DSN=commercial` in `.env`.
3. Confirm the DSN exists on the machine running the API (it already does on
   this one).
4. `npm start`.

No code changes are needed. The production server is
`192.168.0.120:4900`, database `commercial`.

The API listens on all network interfaces, so agents on the LAN can use
`http://<server-ip>:3100`. If a separate frontend on another origin calls the
API, set `CORS_ORIGIN` (for example `CORS_ORIGIN=http://localhost:5173`). The
test page has no login: put the API behind the company reverse proxy / VPN, or
add authentication, before exposing it outside the LAN.

Ideally ask IT for a **read-only HFSQL user** for the API. If the DSN uses the
application account, the API still only runs `SELECT`s, but a dedicated
read-only account is safer.

## Balance app integration

The cloned Electron weighbridge app lives in `balance/`. Its **2e balance** screen
has a **Charger le BL** button next to `N° BL`:

1. the renderer sends only the BL number through the typed IPC channel
   `bl:lookup`;
2. the main process calls `GET /api/bl/:number` (the renderer never calls HFSQL);
3. the client name, BL reference and product lines are filled in;
4. each line's resolved `weightKg` becomes the ticket's `quantityKg`, so the
   ticket's **poids supposé** is the BL total. Finished veterinary products use
   `Qte × 100` (quintals), so `BL26-05255` imports 2 000 kg;
5. if neither a weight nor a quantity can be resolved, the line is left at
   `0 kg` and the screen asks the operator to enter the kg before the second
   weighing. Nothing is invented.

The API address is set in **Paramètres → API des bons de livraison** and stored
in the app's local `settings.json`. The default is
`http://127.0.0.1:3100`; `BL_API_URL` is accepted as an environment fallback.
For a LAN installation, set the address of the machine running this API.

The balance app starts the local API itself when the configured address is on
`localhost`/`127.0.0.1` and no service is already responding. The API runs in a
separate Electron Node process, is reused if it is already up, and is stopped
when the app quits. Port `3100` is used instead of `3000` because `3000` is
already taken by another Windows service on this machine. When the configured
address is `127.0.0.1`, the auto-started service listens on loopback only; run
`npm start` separately if other LAN machines must reach the API.

Just start the Electron app:

```bash
cd balance
npm ci
npm run dev
```

If you prefer to run the API separately (or point the app at a LAN server), start
it first with `npm start` in the project root; the app will reuse it.

`npm run dev` downloads the Electron binary first if it is missing (`predev`).
MySQL must also be running in WSL before logging in; the app reports a database
connection error on the login screen otherwise.

The balance app has its own checks:

```bash
cd balance
npm run typecheck
npm run lint
npm test
```

The `balance/` app keeps its own MySQL database; the BL API stays read-only on
HFSQL. A BL API outage does not block weighing: the operator can still type the
BL and products manually.

## Scripts

```bash
npm start       # start the API + test page
npm run dev     # start with file watching
npm test        # unit tests for the BL parser and weight resolution
npm run probe   # read-only connectivity probe against HFSQL
npm run export  # export a sample full BL + schema to samples/
```

`npm run export` uses `BL26-05255` by default and writes:

- `samples/BL26-05255-full.json` — complete API response,
- `samples/BL26-05255-fields.md` — field/value tables for choosing fields,
- `samples/schema.json` — all table/column metadata.

These files contain real business data. `samples/` is ignored by git.

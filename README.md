# Balance — gestion des pesées + lecture des BL (HFSQL)

Application de bureau (Electron + React + TypeScript) pour le pont-bascule, avec
un **service BL** qui lit les bons de livraison dans l'ERP HFSQL.

```
src/
  main/        processus principal Electron (MySQL, port série, impression, IPC)
    bl/        client du service BL + démarrage du service avec l'application
  preload/     seul pont entre main et renderer
  renderer/    interface (React)
  bl-api/      service BL : API Node/Express en lecture seule sur HFSQL (ODBC)
  shared/      types et logique pure partagés (dont domain/bl-number, bl-weight)
migrations/    schéma MySQL de l'application (001 … 006)
docs/          modèle du domaine et ADR (docs/adr)
tools/         scripts d'aide (série, tests MySQL jetables)
```

Deux bases, deux rôles : **MySQL** (dans WSL) est la base de l'application ;
**HFSQL** est l'ERP de l'entreprise, lu uniquement par le service BL et jamais
modifié.

## Démarrer

```bash
npm ci
copy .env.example .env     # puis régler HFSQL_CONN
npm run dev
```

L'application lance elle-même le service BL (processus séparé, `bl-api.js`) quand
l'adresse configurée est locale (`http://127.0.0.1:3100` par défaut), le réutilise
s'il tourne déjà et l'arrête à la fermeture. MySQL doit tourner dans WSL avant la
connexion.

Si HFSQL est injoignable (télétravail, serveur arrêté), **le service démarre
quand même** : l'écran de pesée affiche « La base HFSQL est injoignable » et la
saisie manuelle du BL reste possible. Dès que la base revient, la connexion se
rétablit seule.

### Service autonome (pour les autres postes du réseau)

```bash
npm run bl:start           # compile puis lance out/main/bl-api.js
```

L'adresse du service se règle dans **Paramètres → API des bons de livraison**
(`BL_API_URL` en repli). Le service lancé par l'application écoute sur la boucle
locale ; un service partagé se lance séparément. Il n'a pas d'authentification :
le garder derrière le réseau interne / VPN.

## Service BL — API

### `GET /api/bl/:number`

| Entrée | Sens |
|---|---|
| `BL26-05255`, `BL2605255`, `BL26/05255` | référence exacte |
| `BL2026-05255`, `BL202605255` | année sur quatre chiffres |
| `26-05255`, `2605255` | année + numéro |
| `5255`, `BL 5255` | numéro seul (toutes les années) |

`?year=2025` désambiguïse un numéro seul. Réponses : `200` (BL trouvé), `400`
(entrée illisible), `404` (inconnu), `409` (numéro présent sur plusieurs années,
avec `candidates`), `503` (HFSQL injoignable), `500` (erreur SQL).

`?full=1` ajoute `full` : chaque colonne non vide de l'en-tête, du client, des
lignes et des articles (noms physiques HFSQL).

### Poids

Chaque ligne expose `weight` (valeur brute `Ligne_MT.Poids`), `weightKg` (poids
résolu), `unitWeightKg` et `weightSource`. Ordre de résolution :

1. `Ligne_MT.POIDS` (total explicite de la ligne) ;
2. `Ligne_MT.POIDS_UN × Qte` ;
3. `Articles.POIDS_BRUT × Qte` ;
4. `Qte × 100` : produits vétérinaires finis, `Qte` est en **quintaux**.

Un poids inconnu reste `null`, jamais 0. `totalWeightKg` n'est rempli que si
**toutes** les lignes ont un poids (sinon `weightComplete: false`, `knownWeightKg`
= somme partielle). Pour `BL26-05255` : 2 + 6 + 12 quintaux → 2 000 kg.
La règle des quintaux est une règle métier à confirmer sur un BL de production.

### Autres routes

- `GET /api/health` — le service tourne (ne touche pas à HFSQL) ;
- `GET /api/status` — état de la base : `200` connectée / `503` injoignable ;
- `GET /api/schema[?table=]` — métadonnées des colonnes (Mouvement, Ligne_MT, Tiers, Articles).

### Correspondance HFSQL

| Information | Source |
|---|---|
| BL | `Mouvement` avec `Type = 23` (préfixe `BL`) |
| Client | `Mouvement.IdTiers` → `Tiers.IdTiers` |
| Lignes | `Ligne_MT.IDMouvement`, `Type = 23` |
| Produit | `Ligne_MT.IDArticle` → `Articles` (`Articles.Reference` = code ; `Code` est toujours vide) |
| Quantités | `Qte`, `Nbr_Colis`, `Colisage`, `Qte_Vrac` |
| Totaux | `Mouvement.HT`, `TTC` (sinon somme des lignes) |

Particularités du pilote ODBC HFSQL : pas de marqueurs `?` (les valeurs, toutes
validées, sont écrites dans le SQL — `src/bl-api/sql.ts`) ; `SELECT *` sur
`Articles` et toute colonne binaire (`IMAGE`) renvoient zéro ligne, d'où les
listes de colonnes explicites (`schema.ts`).

### Robustesse de la connexion

- connexion ouverte **à la demande**, requêtes sérialisées sur une connexion ;
- délais (`HFSQL_CONNECT_TIMEOUT_MS`, `HFSQL_QUERY_TIMEOUT_MS`) : une requête
  bloquée fait jeter la connexion au lieu de geler le service ;
- connexion coupée → une réouverture automatique (sans risque : SELECT seulement) ;
- erreurs de connexion reconnues par SQLSTATE (classe `08`) et par message.

## Diagnostiquer contre la vraie base

```bash
npm run bl:probe [BL26-05255]    # connexion, en-tête, client, lignes, poids
npm run bl:export [BL26-05255]   # écrit samples/ (JSON complet, champs, schéma)
```

`samples/` contient des données réelles : ignoré par git. Les tests automatiques
utilisent une fausse base ; **seul `bl:probe` valide le SQL contre HFSQL.**

## Vérifications

```bash
npm run typecheck && npm run lint && npm test
npm run test:db          # intégration MySQL (WSL)
```

Prérequis du service : Windows avec le pilote ODBC **HFSQL 64 bits** et un DSN
(`allaa` en développement, `commercial` en production, serveur `192.168.0.120:4900`).
`odbc` est un module natif N-API : aucun rebuild nécessaire entre Node et Electron.
Demander à l'IT un utilisateur HFSQL **en lecture seule** pour le DSN.

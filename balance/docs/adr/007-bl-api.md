# ADR 007 — Importer les BL depuis l'API HFSQL

## Contexte

La 2e balance doit comparer le poids déclaré sur un bon de livraison au poids
lu sur le pont. HFSQL contient les produits et les quantités, mais le poids peut
être stocké dans `Ligne_MT.POIDS`, `Ligne_MT.POIDS_UN` ou
`Articles.POIDS_BRUT`. Les produits vétérinaires finis n'ont pas de poids :
leur `Qte` est exprimée en quintaux (1 quintal = 100 kg).

L'application Electron ne doit pas se connecter directement à HFSQL : la base
est en lecture seule côté API, et le renderer ne doit jamais toucher à une base.

## Décision

- Le processus principal appelle l'API HTTP `GET /api/bl/:number` via un client
  typé (`src/main/bl-api.ts`), puis expose le résultat par le canal IPC
  `bl:lookup` après validation de l'entrée.
- L'adresse du service est configurable dans `settings.json` (écran Paramètres)
  et retombe sur `http://127.0.0.1:3100` ou `BL_API_URL`.
- Pour une adresse locale, le processus principal démarre lui-même l'API dans un
  processus Electron séparé en mode Node (`ELECTRON_RUN_AS_NODE`), sur le port
  de l'URL configurée. Une API déjà présente est réutilisée ; elle est arrêtée à
  la fermeture de l'application. Le port `3100` évite le `3000` déjà occupé par
  un service Windows sur le poste. Avec l'adresse `127.0.0.1`, le service est
  limité à la boucle locale ; un service destiné au LAN se lance séparément.
- Le bouton « Charger le BL » de la 2e balance remplit le client, le numéro et
  les lignes. Le poids résolu devient `quantityKg`; le poids supposé du ticket
  est donc la somme du BL.
- La résolution du poids est faite par l'API : ligne, puis poids unitaire, puis
  poids article, puis `Qte × 100` pour les produits finis sans poids.
- Quand aucun poids ni quantité n'est disponible, la ligne est laissée à `0`
  (donc incomplète) et un avertissement demande à l'opérateur de saisir les kg.
  Aucun poids n'est inventé.
- Un total partiel n'est jamais présenté comme le total du BL.

## Conséquences

- L'API locale est démarrée automatiquement avec l'application ; une API
  distante doit être joignable depuis le poste de pesée.
- La conversion `Qte` → quintaux doit être confirmée sur un BL de production :
  c'est la règle métier des produits vétérinaires finis, pas une déduction
  automatique de HFSQL.
- Une panne de l'API n'empêche pas la pesée : l'opérateur peut saisir le BL et
  les produits à la main.

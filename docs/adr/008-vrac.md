# ADR 008 — Sortie en vrac : peser d'abord, le BL vient après

## Contexte

Une sortie ordinaire suit l'ordre « BL → pesée » : le commercial a déjà établi le BL,
l'application le lit dans HFSQL (ADR 007), en tire produits et poids attendu, et la
balance vérifie l'écart.

Pour le vrac c'est l'inverse. Le client arrive, est pesé, repart chargé puis revient
(double pesée). Aucun BL n'existe : le poids net **est** la quantité vendue. Le commercial
s'en sert pour établir le BL (prix unitaire, total) puis la facture. Avant cet ADR,
l'application exigeait des produits avec une quantité avant la 2e pesée et jugeait un
écart contre eux : impossible à satisfaire pour du vrac.

## Décision

Un drapeau `operations.is_vrac` (migration 007), réservé aux SORTIE qui ne sont pas des
retours (`canBeVrac`).

- **Pesée** : à la 2e balance on saisit le produit seul. Le net devient la quantité de
  l'unique ligne (`buildVracLine`) ; `weight_supposed`, `ecart` et `ecart_ok` restent
  vides. Le stock (`v_stock_moves`) n'a pas à changer : la ligne porte le bon poids.
- **BL à établir** : état dérivé, sans colonne ni statut de plus : vrac pesé, non annulé,
  `bl_no` vide (`isBlPending`, filtre SQL `blPending`, même définition aux deux endroits).
- **Rapprochement** : quand le commercial a établi le BL, l'opérateur saisit son numéro
  dans Tickets et le vérifie contre HFSQL. Référence, date et client sont repris ; le poids
  du BL est comparé au net pesé (`compareBlToNet`, tolérance 1 kg pour l'arrondi au
  quintal). C'est informatif : une différence est signalée, jamais bloquante.
- **Ticket imprimé** : mention VRAC, quantité « pesée », bandeau « BL à établir par le
  commercial » tant que le numéro manque.

L'application reste **en lecture seule sur HFSQL** : elle n'écrit ni BL ni facture.

## Pourquoi pas autrement

- *Un type de ticket VRAC* : le stock, la numérotation, l'impression et les écrans
  dépendent du type ; un drapeau comme `is_retour` évite de tout dupliquer.
- *Écrire le BL dans HFSQL depuis la balance* : lie l'application au schéma d'écriture de
  l'ERP et contourne la saisie du prix par le commercial.
- *Plusieurs produits en vrac* : sans BL, rien ne dit combien de chacun ; refusé.

## Conséquences

- Vrac non modifiable après la 2e pesée (la quantité de la ligne est le net) : annuler le
  ticket pour recommencer.
- Pas encore traités : un même BL lié à deux tickets, un BL livré en plusieurs rotations,
  et l'obligation d'un superviseur quand l'écart d'une sortie ordinaire dépasse la
  tolérance. Voir le tableau des cas particuliers dans `docs/domain-model.md`.

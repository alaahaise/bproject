# ADR 008 — Sortie en vrac : peser d'abord, plusieurs rotations, un seul BL

## Contexte

Une sortie ordinaire suit l'ordre « BL → pesée » : le commercial a déjà établi le BL,
l'application le lit dans HFSQL (ADR 007), en tire produits et poids attendu, et la
balance vérifie l'écart.

Pour le vrac c'est l'inverse, et en plus un client prend rarement tout en une fois :
il fait **plusieurs rotations** (par exemple 4). À chaque rotation le camion est pesé à
l'arrivée, part charger, puis est repesé : le net de **cette rotation** est connu tout de
suite. Aucun BL n'existe. Le commercial établit **un seul BL** sur la **somme** des nets
(prix unitaire, total), puis la facture.

Avant cet ADR, l'application exigeait des produits avec une quantité avant la 2e pesée et
jugeait un écart contre eux, et ne savait pas additionner plusieurs tickets.

## Décision

**Une rotation = un ticket** (`operations.is_vrac`, migration 007), réservé aux SORTIE
hors retour (`canBeVrac`). **Un enlèvement = les rotations d'un client** (`vrac_groups`,
migration 008), rattachées par `operations.vrac_group_id`.

- **Pesée d'une rotation** : à la 2e balance on saisit le produit seul. Le net devient la
  quantité de la ligne unique (`buildVracLine`) ; `weight_supposed`, `ecart` et
  `ecart_ok` restent vides. Le stock (`v_stock_moves`) n'a pas à changer : chaque ligne
  porte le bon poids.
- **Enlèvement** : OUVERT (accepte de nouvelles rotations) puis CLOS (« le client a
  fini »). Tout ticket vrac appartient à un enlèvement, même seul : un seul chemin de code.
  À la 1re balance l'opérateur choisit « nouvel enlèvement » ou un enlèvement ouvert ; le
  camion déjà présent dans un seul enlèvement ouvert est proposé d'office.
- **Total** : toujours calculé (`summarizeVracGroup`) = somme des nets des rotations
  pesées et non annulées. Jamais stocké, donc jamais périmé.
- **Clôture** (`closeBlocker`) : refusée tant qu'une rotation attend sa 2e pesée (son net
  manquerait au total remis au commercial) ou sans aucune rotation pesée. Réouvrable tant
  qu'aucun BL n'est lié (un BL établi sur le total serait faux avec une rotation de plus).
- **Récapitulatif imprimable** (`vrac-html.ts`) : chaque rotation et le **total à
  facturer**, remis au commercial. Provisoire tant que l'enlèvement est ouvert ; bandeau
  « BL à établir » une fois clos et sans BL.
- **Rapprochement** : le BL du commercial est vérifié dans HFSQL puis rattaché à **toutes**
  les rotations d'un coup (`linkBl`) ; saisi sur un ticket, il se propage aux autres. Son
  poids est comparé au **total** de l'enlèvement (`compareBlToNet`, tolérance 1 kg pour
  l'arrondi au quintal) : informatif, jamais bloquant.

L'application reste **en lecture seule sur HFSQL** : elle n'écrit ni BL ni facture.

## Pourquoi pas autrement

- *Un seul ticket pour toutes les rotations* : le camion ne peut avoir qu'une paire
  1re/2e pesée par ticket, et la traçabilité (plaque, heure, poids) se perd.
- *Un type de ticket VRAC* : le stock, la numérotation, l'impression et les écrans
  dépendent du type ; un drapeau comme `is_retour` évite de tout dupliquer.
- *Stocker le total sur l'enlèvement* : il serait faux dès qu'une rotation est annulée ou
  corrigée ; la somme se calcule à la demande sur quelques lignes.
- *Écrire le BL dans HFSQL depuis la balance* : lie l'application au schéma d'écriture de
  l'ERP et contourne la saisie du prix par le commercial.
- *Plusieurs produits par rotation* : sans BL, rien ne dit combien de chacun ; refusé.
  (Plusieurs produits au total sont possibles : une rotation par produit.)

## Conséquences

- Vrac non modifiable après la 2e pesée (la quantité de la ligne est le net) : annuler le
  ticket pour recommencer.
- Pas encore traités : un même BL lié à deux enlèvements, un BL connu d'avance livré en
  plusieurs rotations (hors vrac), et l'obligation d'un superviseur quand l'écart d'une
  sortie ordinaire dépasse la tolérance. Voir le tableau des cas particuliers dans
  `docs/domain-model.md`.

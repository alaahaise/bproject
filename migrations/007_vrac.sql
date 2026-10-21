-- 007 — Sortie en vrac : le client est pesé, puis le commercial établit le BL.
--
-- Une sortie ordinaire a déjà son BL : on le lit dans HFSQL, il donne les produits
-- et le poids attendu, et la balance vérifie (écart). Le vrac est l'inverse :
-- le camion est pesé AVANT qu'aucun BL n'existe. Le poids net est la quantité
-- vendue ; le commercial s'en sert pour établir le BL (prix unitaire, total) puis
-- la facture. Il n'y a donc ni poids supposé ni écart à juger.
--
--   is_vrac = 1  : le produit se saisit sans quantité à la 2e pesée, et le poids
--                  net devient la quantité de la ligne (donc le stock sort le
--                  bon poids) ;
--   bl_no vide   : « BL à établir » ; l'opérateur le renseigne quand le
--                  commercial l'a créé (champ déjà modifiable, tracé dans audit_log).

ALTER TABLE operations
  ADD COLUMN is_vrac TINYINT(1) NOT NULL DEFAULT 0 AFTER is_retour,
  ADD KEY ix_ops_vrac (is_vrac, bl_no);

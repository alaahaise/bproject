-- 008 — Enlèvement vrac : plusieurs rotations, un seul BL.
--
-- Un client qui prend du vrac fait souvent plusieurs rotations : à chaque passage
-- il est pesé à l'arrivée et au retour du chargement. Chaque rotation est un
-- ticket (son net est connu tout de suite) ; le commercial n'établit qu'UN BL,
-- sur la somme des nets. Un « enlèvement » regroupe donc les tickets d'un même
-- client :
--
--   OUVERT : on peut encore y ajouter une rotation ;
--   CLOS   : l'opérateur a dit « c'est fini » ; le total est remis au commercial.
--
-- Le total n'est jamais stocké : c'est la somme des nets des rotations non
-- annulées. Un ticket vrac appartient toujours à un enlèvement (même s'il n'a
-- qu'une rotation), ce qui évite deux chemins de code.

CREATE TABLE vrac_groups (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status      ENUM('OUVERT','CLOS') NOT NULL DEFAULT 'OUVERT',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at   DATETIME NULL,
  closed_by   INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_vg_status (status, created_at),
  CONSTRAINT fk_vg_closed_by FOREIGN KEY (closed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE operations
  ADD COLUMN vrac_group_id BIGINT UNSIGNED NULL AFTER is_vrac,
  ADD KEY ix_ops_vrac_group (vrac_group_id),
  ADD CONSTRAINT fk_ops_vrac_group FOREIGN KEY (vrac_group_id) REFERENCES vrac_groups (id);

-- Reprise de la 007 : chaque ticket vrac existant devient son propre enlèvement
-- (l'id du groupe reprend celui du ticket). Déjà un BL = enlèvement clos.
INSERT INTO vrac_groups (id, status, created_at, closed_at)
SELECT o.id,
       IF(o.bl_no IS NULL OR o.bl_no = '', 'OUVERT', 'CLOS'),
       o.created_at,
       IF(o.bl_no IS NULL OR o.bl_no = '', NULL, o.created_at)
  FROM operations o
 WHERE o.is_vrac = 1;

UPDATE operations SET vrac_group_id = id WHERE is_vrac = 1;

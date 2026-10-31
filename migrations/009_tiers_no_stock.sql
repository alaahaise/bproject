-- 009 — TIERS tickets are weighbridge evidence, not company stock movements.
--
-- Existing tickets and weighings remain untouched. The view simply excludes
-- TIERS from both movement directions, including legacy rows with locations.
DROP VIEW IF EXISTS v_stock_moves;

CREATE OR REPLACE VIEW v_stock_moves AS
  SELECT o.id AS operation_id, o.ticket_no, o.type, l.product_code,
         o.location_to_id AS location_id,
         ROUND(o.net_weight * l.quantity_kg / t.total_kg, 3) AS qty_in,
         CAST(0 AS DECIMAL(12,3)) AS qty_out,
         o.created_at
    FROM operations o
    JOIN operation_lines l ON l.operation_id = o.id
    JOIN (SELECT operation_id, SUM(quantity_kg) AS total_kg
            FROM operation_lines GROUP BY operation_id) t ON t.operation_id = o.id
   WHERE o.status = 'FERMEE'
     AND o.type <> 'TIERS'
     AND o.location_to_id IS NOT NULL
  UNION ALL
  SELECT o.id, o.ticket_no, o.type, l.product_code,
         o.location_from_id,
         CAST(0 AS DECIMAL(12,3)),
         ROUND(o.net_weight * l.quantity_kg / t.total_kg, 3),
         o.created_at
    FROM operations o
    JOIN operation_lines l ON l.operation_id = o.id
    JOIN (SELECT operation_id, SUM(quantity_kg) AS total_kg
            FROM operation_lines GROUP BY operation_id) t ON t.operation_id = o.id
   WHERE o.status = 'FERMEE'
     AND o.type <> 'TIERS'
     AND o.location_from_id IS NOT NULL;

-- Availability slots moved from 15 to 30 minutes: fold :15 into :00 and :45 into :30,
-- deduplicate, and keep the keys sorted.
UPDATE "hangout_availability"
SET "slots" = ARRAY(
  SELECT DISTINCT regexp_replace(regexp_replace(s, ':15$', ':00'), ':45$', ':30')
  FROM unnest("slots") AS s
  ORDER BY 1
)
WHERE EXISTS (SELECT 1 FROM unnest("slots") AS s WHERE s ~ ':(15|45)$');

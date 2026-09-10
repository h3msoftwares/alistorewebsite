#!/usr/bin/env bash
# EXPLAIN (ANALYZE, BUFFERS) for the hot / expensive query paths, against the
# seeded load-test DB. Run in a quiet window (no load) so timings are clean.
#   bash loadtest/explain.sh > loadtest/results/explain.txt 2>&1
set -u
PSQL="/c/Program Files/PostgreSQL/17/bin/psql.exe"
DB="postgresql://alistore:alistore@127.0.0.1:5544/alistore"
q() { echo; echo "======== $1"; shift; "$PSQL" "$DB" -X -qAt -c "$1"; }
e() { echo; echo "======== $1"; shift; "$PSQL" "$DB" -X -c "EXPLAIN (ANALYZE, BUFFERS, TIMING) $1"; }

CAT=$("$PSQL" "$DB" -X -qAtc "SELECT id FROM category WHERE \"collectionID\" IS NOT NULL LIMIT 1;")
COL=$("$PSQL" "$DB" -X -qAtc "SELECT id FROM collection LIMIT 1;")
echo "sample category=$CAT collection=$COL"

q "row counts" "SELECT 'product' t,count(*) c FROM product UNION ALL SELECT 'productvariant',count(*) FROM productvariant UNION ALL SELECT 'orderitem',count(*) FROM orderitem UNION ALL SELECT 'order',count(*) FROM \"order\" UNION ALL SELECT 'productimage',count(*) FROM productimage;"
q "indexes on product / order / productvariant / orderitem" "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename IN ('product','order','productvariant','orderitem') ORDER BY tablename,indexname;"

e "1. storefront product listing (default sort dateCreated desc, page 1)" \
  "SELECT * FROM product WHERE \"isActive\"=true AND \"deletedAt\" IS NULL ORDER BY \"dateCreated\" DESC LIMIT 24 OFFSET 0;"

e "2. storefront product listing COUNT (pagination total)" \
  "SELECT count(*) FROM product WHERE \"isActive\"=true AND \"deletedAt\" IS NULL;"

e "3. product search via trigram (searchText ILIKE '%shirt%')" \
  "SELECT * FROM product WHERE \"isActive\"=true AND \"deletedAt\" IS NULL AND \"searchText\" ILIKE '%shirt%' ORDER BY \"dateCreated\" DESC LIMIT 24;"

e "4. product listing filtered by category" \
  "SELECT * FROM product WHERE \"isActive\"=true AND \"deletedAt\" IS NULL AND \"categoryID\"='$CAT' ORDER BY \"dateCreated\" DESC LIMIT 24;"

e "5. product listing sorted by price asc" \
  "SELECT * FROM product WHERE \"isActive\"=true AND \"deletedAt\" IS NULL ORDER BY price ASC LIMIT 24;"

e "6. best_selling groupBy (orderitem x order, 90d window)" \
  "SELECT oi.\"variantID\", sum(oi.quantity) FROM orderitem oi JOIN \"order\" o ON o.id=oi.\"orderID\" WHERE o.\"dateCreated\" >= now() - interval '90 days' AND o.status NOT IN ('CANCELLED','RETURNED') GROUP BY oi.\"variantID\";"

e "7. admin orders list (status filter, unbounded, order by dateCreated desc)" \
  "SELECT * FROM \"order\" WHERE status='PENDING' ORDER BY \"dateCreated\" DESC;"

e "8. admin dashboard: low-stock variant count" \
  "SELECT count(*) FROM productvariant pv JOIN product p ON p.id=pv.\"productID\" WHERE pv.\"stockQuantity\" > 0 AND pv.\"stockQuantity\" <= 5 AND p.\"deletedAt\" IS NULL;"

e "9. admin dashboard: delivered-revenue sum" \
  "SELECT sum(subtotal) FROM \"order\" WHERE status='DELIVERED';"

e "10. checkout order-velocity probe (per checkout, x3)" \
  "SELECT count(*) FROM \"order\" WHERE \"deliveryPhone\"='+9613000000' AND \"dateCreated\" > now() - interval '24 hours';"

e "11. analytics: revenue by category (orderitem->variant->product->category 3-way join, delivered, 90d)" \
  "SELECT c.\"nameEn\", sum(oi.\"lineTotal\") FROM orderitem oi JOIN productvariant pv ON pv.id=oi.\"variantID\" JOIN product p ON p.id=pv.\"productID\" JOIN category c ON c.id=p.\"categoryID\" JOIN \"order\" o ON o.id=oi.\"orderID\" WHERE o.status='DELIVERED' AND o.\"dateCreated\" >= now() - interval '90 days' GROUP BY c.\"nameEn\" ORDER BY 2 DESC;"

echo; echo "======== done"

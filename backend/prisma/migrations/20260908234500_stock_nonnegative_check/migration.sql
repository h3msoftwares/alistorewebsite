-- Backstop for the checkout stock-claim (see order.service.ts). Even if some
-- future code path forgets the atomic guarded decrement, the DB refuses to
-- let a variant's stock go negative.
ALTER TABLE "productvariant"
  ADD CONSTRAINT "productvariant_stock_nonnegative" CHECK ("stockQuantity" >= 0);

import { z } from 'zod';

// Shared by Promotion, Coupon, and the product's own sale (Product.saleType)
// — kept as a tiny standalone module so neither of the first two has to
// import the enum from the other.
export const discountTypeSchema = z.enum(['PERCENT', 'AMOUNT']);

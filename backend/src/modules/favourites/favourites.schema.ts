import { z } from 'zod';

// The frontend only ever knows product ids (favouritesSlice stores product
// ids, ProductCard links by product), so both the add body and the delete
// param are keyed on productID rather than a Favorite row id.
export const addFavouriteSchema = z.object({
  productID: z.string().uuid(),
});

export const favouriteProductIdParamSchema = z.object({
  productID: z.string().uuid(),
});

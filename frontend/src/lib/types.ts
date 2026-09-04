// Domain + API types mirroring the finalized backend Prisma schema
// (`backend/prisma/schema.prisma`). Kept hand-written (not generated) so the
// frontend only carries the fields it actually consumes.
//
// Serialization notes:
// - Prisma `Decimal` (money) arrives as a JSON **string** — always `Number()`
//   it at the edge (see PriceTag/ProductCard).
// - `DateTime` arrives as an ISO-8601 string.

export type UUID = string;
export type IsoDateTime = string;
export type Decimalish = string | number;

// ---- Enums (match the backend) ----

export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';
export type PaymentMethod = 'COD' | 'CARD'; // CARD is reserved; the API rejects it
export type PaymentStatus = 'PENDING' | 'COLLECTED' | 'REFUNDED';
export type StockMovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT'
  | 'RETURN'
  | 'RESTOCK';
/** A product sale is a percentage off (0–100) or a flat amount off the price. */
export type DiscountType = 'PERCENT' | 'AMOUNT';

// ---- Catalog ----

/** Gallery image — identical shape for Product, Collection and Category
 *  (backend models `ProductImage` / `CollectionImage` / `CategoryImage`).
 *  Ordered by `sortOrder` asc; the first row is the "base" image. */
export interface CatalogImage {
  id: UUID;
  url: string;
  altEn?: string | null;
  altAr?: string | null;
  sortOrder: number;
}
export type ProductImage = CatalogImage & { productID: UUID };
export type CollectionImage = CatalogImage & { collectionID: UUID };
export type CategoryImage = CatalogImage & { categoryID: UUID };

/** Owner-editable top-level grouping. Replaces the old fixed `Department`
 *  enum. The storefront's three primary doors (Women/Men/Kids) are the seeded
 *  collections — see `lib/collections.ts`. Hierarchy: Collection → Category → Product. */
export interface Collection {
  id: UUID;
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  isActive: boolean;
  /** Owner-picked: appears in the top nav / footer. Order reuses `sortOrder`. */
  showInNav: boolean;
  sortOrder: number;
  /** `#rrggbb` — drives the `--collection-accent*` CSS vars (see `accentStyle`). */
  accentColor?: string | null;
  images: CollectionImage[];
  /** Present on `GET /api/collections/:id` and `/slug/:slug` — active categories,
   *  one level of nesting, ordered by `sortOrder`. */
  categories?: Category[];
  _count?: { categories: number; products: number };
}

export interface Category {
  id: UUID;
  /** Nullable — a category can stand alone, unattached to any collection. */
  collectionID?: UUID | null;
  nameEn: string;
  nameAr: string;
  slug: string;
  parentCategoryID?: UUID | null;
  isActive: boolean;
  sortOrder: number;
  images: CategoryImage[];
  /** Present on `GET /categories` (one level of nesting). */
  children?: Category[];
  /** `null` for a standalone category. */
  collection?: Pick<Collection, 'id' | 'nameEn' | 'nameAr' | 'slug' | 'accentColor'> | null;
}

export interface ProductVariant {
  id: UUID;
  productID: UUID;
  sku: string;
  /** Nullable now — not every product has a size or a colour. */
  size?: string | null;
  color?: string | null;
  stockQuantity: number;
}

export interface Product {
  id: UUID;
  sku: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  categoryID: UUID;
  /** Denormalized mirror of the category's collection (derived server-side).
   *  `null` when the product's category stands alone. */
  collectionID?: UUID | null;
  price: Decimalish;
  compareAtPrice?: Decimalish | null;
  /** Product-level quantity — free-standing signed int (may be 0 or negative). */
  quantity: number;
  /** Active sale. Both null ⇒ no sale. */
  saleType?: DiscountType | null;
  saleValue?: Decimalish | null;
  /** Computed by the API: what the shopper pays after the sale (>= 0), and
   *  whether a sale is currently reducing the price. */
  effectivePrice: number;
  onSale: boolean;
  isActive: boolean;
  dateCreated: IsoDateTime;
  images: ProductImage[];
  variants: ProductVariant[];
  category?: Category;
  /** `null` when the product's category stands alone. */
  collection?: Pick<Collection, 'id' | 'nameEn' | 'nameAr' | 'slug'> | null;
}

// ---- Cart ----

export interface CartItem {
  id: UUID;
  cartID: UUID;
  variantID: UUID;
  quantity: number;
  variant: ProductVariant & { product: Product };
}

/** `GET /api/cart` response — the server resolves the Cart row (per user or
 *  per guest-session cookie) and returns its lines plus a computed subtotal. */
export interface CartView {
  items: CartItem[];
  subtotal: number;
}

// ---- Favourites ----

/** One row of `GET /api/favourites` — a hydrated product (same shape the
 *  catalog endpoints return, incl. `effectivePrice` / `onSale` / `images`)
 *  plus when it was hearted. Backend requires auth; guests never hit this
 *  endpoint (see `useFavourites` — guest favourites live in the Redux slice
 *  + localStorage). */
export interface FavouriteEntry {
  id: UUID;
  dateCreated: IsoDateTime;
  product: Product;
}

// ---- Orders ----

export interface OrderItem {
  id: UUID;
  orderID: UUID;
  variantID: UUID;
  // Full snapshot — stays displayable if the product/variant changes later.
  productName: string;
  productSKU: string;
  variantSKU: string;
  productImageUrl?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unitPrice: Decimalish;
  lineTotal: Decimalish;
}

export interface Order {
  id: UUID;
  orderNumber: string;
  userID?: UUID | null;
  addressID?: UUID | null;
  guestEmail?: string | null;
  // Delivery snapshot captured at order time (see schema §2.4).
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryArea?: string | null;
  deliveryNotes?: string | null;
  notes?: string | null;
  subtotal: Decimalish;
  total: Decimalish;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  dateCreated: IsoDateTime;
  items: OrderItem[];
}

/** Body for `POST /api/orders/checkout` (COD only). The delivery-* fields are
 *  the snapshot; `addressId` optionally references a saved Address. */
export interface CheckoutBody {
  addressId?: UUID;
  guestEmail?: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryArea?: string;
  deliveryNotes?: string;
  notes?: string;
}

// ---- Auth / account ----

export interface Address {
  id: UUID;
  userID: UUID;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  area?: string | null;
  notes?: string | null;
  isDefault: boolean;
}

export interface AuthUser {
  id: UUID;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
}

// ---- Product list query (GET /api/products) ----

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';

export interface ProductListQuery {
  collectionId?: UUID;
  categoryId?: UUID;
  search?: string;
  size?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Request payloads (write endpoints) ----

export interface RegisterBody {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginBody {
  identifier: string; // email or phone
  password: string;
}

/** Delivery is email-only (no SMS provider is wired), so — unlike LoginBody's
 *  identifier — this is keyed on `email`. `locale` only shapes the link the
 *  email contains; defaults to 'en' server-side if omitted. */
export interface ForgotPasswordBody {
  email: string;
  locale?: 'en' | 'ar';
}

export interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

export interface AuthResult {
  accessToken: string;
  user?: AuthUser;
}

export interface ImageBody {
  url: string;
  altEn?: string;
  altAr?: string;
  sortOrder?: number;
}

export interface CollectionBody {
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string;
  descriptionAr?: string;
  isActive?: boolean;
  // TODO(admin-collections): expose showInNav / sortOrder / accentColor in the admin form.
  showInNav?: boolean;
  sortOrder?: number;
  accentColor?: string | null;
  categoryIds?: UUID[];
}

export interface CategoryBody {
  /** Omit or `null` for a standalone category; `null` on update detaches an
   *  existing category from its collection. */
  collectionId?: UUID | null;
  nameEn: string;
  nameAr: string;
  slug: string;
  parentCategoryId?: UUID;
  isActive?: boolean;
  sortOrder?: number;
}

export interface VariantBody {
  sku: string;
  size?: string | null;
  color?: string | null;
  stockQuantity?: number;
}

export interface ProductBody {
  sku: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  categoryId: UUID;
  // No collectionId: the product's collection is derived server-side from its
  // category (a denormalized mirror), never sent by the client.
  price: number;
  compareAtPrice?: number;
  /** May be 0 or negative; independent of `isActive`. Defaults to 0. */
  quantity?: number;
  /** Set both together, or neither. `PERCENT` value is 0–100. */
  saleType?: DiscountType | null;
  saleValue?: number | null;
  variants: VariantBody[];
}

export interface AddressBody {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  area?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface ProfileBody {
  name?: string;
  phone?: string | null;
}

export interface AdminDashboard {
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
}

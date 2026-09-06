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
  /** ImageKit's file id for this asset — lets the delete endpoint remove the
   *  underlying file, not just this row. `null`/absent on rows uploaded
   *  before this field existed. */
  fileId?: string | null;
  altEn?: string | null;
  altAr?: string | null;
  sortOrder: number;
}
export type ProductImage = CatalogImage & {
  productID: UUID;
  /** Ties this image to one of the product's colour options — `null` means
   *  it's shown regardless of colour (generic/fallback shots). */
  color?: string | null;
};
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
  /** Owner-picked: gets its own featured row on the home page (name + a
   *  horizontal scroll of its categories). Independent of `showInNav`. Order
   *  among featured rows (collections + categories, interleaved) reuses
   *  `sortOrder` as a shared ranking key. */
  showOnHome: boolean;
  sortOrder: number;
  /** `#rrggbb` — drives the `--collection-accent*` CSS vars (see `accentStyle`). */
  accentColor?: string | null;
  /** Set when archived from the admin — hidden from the storefront, restorable. */
  archivedAt?: string | null;
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
  /** Owner-picked: gets its own featured row on the home page (name + a
   *  horizontal scroll of its products), independent of its parent
   *  collection's own `showOnHome`. */
  showOnHome: boolean;
  sortOrder: number;
  /** Set when archived from the admin — hidden from the storefront, restorable. */
  archivedAt?: string | null;
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
  /** Per-variant price override — `null`/absent falls back to the product's
   *  own `price`, so sizes/colours can share one price or each carry their
   *  own. */
  price?: Decimalish | null;
  /** Computed by the API, using this variant's price-or-fallback with the
   *  product's sale applied on top — present when the variant is nested in a
   *  Product response (list/get/create/update); absent on the bare variant
   *  sub-resource endpoints (POST/PATCH /products/:id/variants). */
  effectivePrice?: number;
  onSale?: boolean;
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
  /** Set when the product is archived (soft-deleted) from the admin. */
  deletedAt?: string | null;
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

/** `active` = live on the storefront; `archived` = archived only; `all` = both.
 *  Anything other than `active` is admin-only. */
export type CatalogStatus = 'active' | 'archived' | 'all';

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
  status?: CatalogStatus;
}

/** Query for the admin collection / category list (small sets — the array
 *  comes back whole and the page paginates it client-side). */
export interface CatalogListQuery {
  search?: string;
  status?: CatalogStatus;
}

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Site settings ----

export interface AnnouncementLine {
  id: UUID;
  textEn: string;
  textAr: string;
  sortOrder: number;
}

/** Owner-editable storefront chrome (`GET /api/settings`). */
export interface SiteSettings {
  id: number;
  brandNameEn: string;
  brandNameAr: string;
  announcementActive: boolean;
  heroEyebrowEn: string;
  heroEyebrowAr: string;
  heroHeadlineEn: string;
  heroHeadlineAr: string;
  heroLedeEn: string;
  heroLedeAr: string;
  heroCtaLabelEn: string;
  heroCtaLabelAr: string;
  heroCtaCollectionID: UUID | null;
  homeMoreHeadingEn: string;
  homeMoreHeadingAr: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  whatsappUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  announcementLines: AnnouncementLine[];
  /** Resolved collection for the hero CTA, when one is set. */
  heroCtaCollection: Pick<Collection, 'id' | 'slug' | 'nameEn' | 'nameAr'> | null;
}

/** Partial patch — every field optional; `''` clears a nullable field;
 *  `announcementLines` replaces the whole list. */
export type SiteSettingsBody = Partial<
  Omit<SiteSettings, 'id' | 'announcementLines' | 'heroCtaCollection' | 'heroCtaCollectionID'>
> & {
  heroCtaCollectionId?: UUID | '' | null;
  announcementLines?: { textEn: string; textAr: string }[];
};

// ---- Request payloads (write endpoints) ----

/** Registration requires an email (verification is email-based) and a full
 *  delivery address (the address `phone` is the account's contact number;
 *  the recipient name defaults to `name`). The server never returns a
 *  session — it mails a verification link; the user verifies then logs in. */
export interface RegisterBody {
  email: string;
  password: string;
  name: string;
  address: {
    phone: string;
    addressLine: string;
    city: string;
    area?: string;
    notes?: string;
  };
  locale?: 'en' | 'ar';
}

export interface VerifyEmailBody {
  token: string;
}

export interface ResendVerificationBody {
  email: string;
  locale?: 'en' | 'ar';
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

/** Signed-in credential change — the current password is required and
 *  verified server-side; a valid session alone is not enough. */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResult {
  accessToken: string;
  user?: AuthUser;
}

export interface ImageBody {
  url: string;
  fileId?: string;
  altEn?: string;
  altAr?: string;
  sortOrder?: number;
}

/** Product images extend the shared shape with an optional colour tag —
 *  `null`/omitted shows the image regardless of colour. Collection/category
 *  images don't have this (they use the plain `ImageBody`). */
export interface ProductImageBody extends ImageBody {
  color?: string | null;
}

export interface CollectionBody {
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string;
  descriptionAr?: string;
  isActive?: boolean;
  // TODO(admin-collections): expose showInNav / showOnHome / sortOrder / accentColor in the admin form.
  showInNav?: boolean;
  showOnHome?: boolean;
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
  showOnHome?: boolean;
  sortOrder?: number;
}

export interface VariantBody {
  sku: string;
  size?: string | null;
  color?: string | null;
  /** Omit or `null` to fall back to the product's own price. */
  price?: number | null;
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
  /** Optional — the storefront defaults the recipient to the account holder's
   *  name server-side; only an admin/API client sets a distinct one. */
  fullName?: string;
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

// ---- Analytics ----
// GET /api/admin/analytics/* — first-party aggregation (orders / inventory /
// customers) plus GA4-sourced traffic & funnel. GA4-backed payloads collapse to
// `{ configured: false }` when the GA4 service account is not set up.

export interface AnalyticsRangeParams {
  from?: string;
  to?: string;
  granularity?: 'day' | 'week' | 'month';
}

export type GaMaybe<T> = (T & { configured: true }) | { configured: false };

export interface RevenuePoint {
  bucket: string;
  revenue: number;
  orders: number;
}

export interface Breakdown {
  label: string;
  revenue: number;
  units: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromTop: number | null;
}

export interface AnalyticsOverview {
  range: { from: string; to: string };
  kpis: {
    revenue: number;
    deliveredRevenue: number;
    orders: number;
    averageOrderValue: number;
    itemsPerOrder: number;
    unitsSold: number;
    newCustomers: number;
    returningCustomers: number;
    lowStockVariants: number;
  };
  revenueSeries: RevenuePoint[];
  funnel: GaMaybe<{ steps: FunnelStep[] }>;
  note: string;
}

export interface AnalyticsSales {
  range: { from: string; to: string };
  revenueSeries: RevenuePoint[];
  byCategory: Breakdown[];
  byProduct: Breakdown[];
  bySize: Breakdown[];
  byColour: Breakdown[];
  note: string;
}

export interface TopCustomer {
  id: UUID;
  name: string;
  email: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsCustomers {
  range: { from: string; to: string };
  kpis: {
    customersWithOrders: number;
    newCustomers: number;
    returningCustomers: number;
    repeatPurchaseRate: number;
    ordersPerCustomer: number;
    lifetimeValue: number;
    avgDaysBetweenPurchases: number | null;
  };
  newVsReturningSeries: { bucket: string; new_customers: number; returning_orders: number }[];
  topCustomers: TopCustomer[];
  note: string;
}

export interface StockRow {
  sku: string;
  product: string;
  size: string | null;
  color: string | null;
  stock?: number;
}

export interface StockMovementRow {
  id: UUID;
  quantity: number;
  type: string;
  reason: string | null;
  createdAt: string;
  variant: { sku: string; product: { nameEn: string } };
}

export interface AnalyticsInventory {
  range: { from: string; to: string };
  kpis: {
    stockUnits: number;
    stockValue: number;
    unitsSold: number;
    sellThroughRate: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  lowStock: StockRow[];
  outOfStock: StockRow[];
  bestSellingSizes: Breakdown[];
  bestSellingColours: Breakdown[];
  slowMovers: { product: string; sku: string }[];
  recentMovements: StockMovementRow[];
  note: string;
}

export interface ProductPerfRow {
  name: string;
  sku: string;
  units: number;
  revenue: number;
  orders: number;
  buyers: number;
  views: number | null;
  viewToPurchaseRate: number | null;
  viewToCartRate: number | null;
}

export interface AnalyticsProducts {
  range: { from: string; to: string };
  products: ProductPerfRow[];
  ga: { configured: boolean; rows?: Record<string, string | number>[] };
  note: string;
}

export type GaRow = Record<string, string | number>;

export interface AnalyticsVisitors {
  configured: boolean;
  traffic?: GaRow[];
  sources?: GaRow[];
  devices?: GaRow[];
  geo?: GaRow[];
  pages?: GaRow[];
}

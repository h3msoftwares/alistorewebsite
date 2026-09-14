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

/** A flat, flexible merchandising grouping (Sale, New Arrivals) — cuts across
 *  the category tree, not a level above it. See `Category` for the permanent
 *  navigation tree, which Collection has no relationship to at all.
 *
 *  Stage 2: `type` decides how membership works —
 *   - MANUAL (Stage 1's only mode): `CollectionProduct` rows are the whole
 *     membership, admin-picked by hand.
 *   - AUTOMATED: membership comes purely from `rules`, computed live.
 *   - HYBRID: `rules` plus a manual INCLUDE/EXCLUDE overlay on top. */
export interface Collection {
  id: UUID;
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  isActive: boolean;
  type: CollectionType;
  showInNav: boolean;
  showOnHome: boolean;
  showOnHomeAsImage: boolean;
  sortOrder: number;
  homeSortOrder: number;
  accentColor?: string | null;
  homeImageCtaEn?: string | null;
  homeImageCtaAr?: string | null;
  /** Set when archived from the admin — hidden from the storefront, restorable. */
  archivedAt?: string | null;
  images: CollectionImage[];
  /** Present on `GET /collections/:id` (the admin edit form) — empty/absent
   *  for a MANUAL collection, since rules are never evaluated for one. */
  rules?: CollectionRule[];
  _count?: { products: number };
}

export type CollectionType = 'MANUAL' | 'AUTOMATED' | 'HYBRID';

/** Deliberately narrower than a generic rule-engine template: every value
 *  here corresponds to real, queryable Product data (see the backend's
 *  CollectionRuleField doc comment) — no BRAND/TAG-style dead options. */
export type CollectionRuleField =
  | 'PRODUCT_STATUS'
  | 'CATEGORY'
  | 'PRICE'
  | 'COMPARE_AT_PRICE'
  | 'HAS_ACTIVE_PROMOTION'
  | 'CREATED_AT'
  | 'STOCK_STATUS';

export type CollectionRuleOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'IN'
  | 'NOT_IN'
  | 'EXISTS';

/** One condition in an AUTOMATED/HYBRID collection's membership rule set.
 *  Rules sharing a `groupNumber` are ANDed together; different group numbers
 *  are ORed. `value`'s actual shape depends on `field` (a plain number for
 *  PRICE, a string for STOCK_STATUS, `{categoryIds, includeDescendants}` for
 *  CATEGORY, absent for HAS_ACTIVE_PROMOTION) — validated server-side, never
 *  interpreted as code. */
export interface CollectionRule {
  id?: UUID;
  groupNumber: number;
  field: CollectionRuleField;
  operator: CollectionRuleOperator;
  value?: unknown;
}

/** The permanent navigation tree (Men → Shoes → Sport Shoes → ...),
 *  unlimited depth, self-referencing via `parentID`. Fully decoupled from
 *  Collection. `path`/`depth` are read-only, server-computed (a Postgres
 *  trigger — never write them). Women/Men/Kids are top-level categories and
 *  carry the storefront nav/home-banner fields (moved here from Collection
 *  in the Stage 1 redesign). */
export interface Category {
  id: UUID;
  parentID?: UUID | null;
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  isActive: boolean;
  /** Owner-picked: gets its own featured row on the home page (name + a
   *  horizontal scroll of its products). Any depth. */
  showOnHome: boolean;
  /** Sibling order among categories with the same parent. NOT the home-page
   *  order of this category's own featured row. */
  sortOrder: number;
  /** Position of this category's own featured row on the home page (shared
   *  key with `Collection.homeSortOrder`). */
  homeSortOrder: number;
  /** Storefront chrome — meaningful in practice only on top-level categories. */
  showInNav: boolean;
  showOnHomeAsImage: boolean;
  accentColor?: string | null;
  homeImageCtaEn?: string | null;
  homeImageCtaAr?: string | null;
  /** Set when archived from the admin — hidden from the storefront (itself
   *  and every descendant, computed at read time), restorable. */
  archivedAt?: string | null;
  /** Read-only, trigger-maintained. Slug-based, e.g. "/men/shoes/". */
  path: string;
  /** Read-only, trigger-maintained. 0 for a root category. */
  depth: number;
  images: CategoryImage[];
  /** Present on `GET /categories` (one level of nesting). */
  children?: Category[];
  /** Present on a product's `primaryCategory` (nested up to 4 levels) — walk
   *  this chain to render a full breadcrumb. `null`/absent at the root. */
  parent?: Category | null;
  /** Computed by the API: this category itself is archived, OR descends from
   *  an archived ancestor. Never written to the row — an admin picker uses
   *  this to flag an option instead of silently allowing (or hiding) it. */
  isEffectivelyArchived?: boolean;
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
  /** The canonical category (breadcrumbs, canonical URL, reporting). */
  primaryCategoryID: UUID;
  price: Decimalish;
  compareAtPrice?: Decimalish | null;
  /** Product-level quantity — free-standing signed int (may be 0 or negative). */
  quantity: number;
  /** Active sale. Both null ⇒ no sale. */
  saleType?: DiscountType | null;
  saleValue?: Decimalish | null;
  /** Computed by the API: what the shopper pays after the product's own sale
   *  AND the best (single, priority-picked) active promotion (>= 0), and
   *  whether that price is below the base price. */
  effectivePrice: number;
  onSale: boolean;
  /** The promotion currently applied to this product, if any — for context
   *  on the storefront. */
  promotion?: AppliedPromotionInfo | null;
  isActive: boolean;
  /** Set when the product is archived (soft-deleted) from the admin. */
  deletedAt?: string | null;
  /** Bumped on every write (Prisma @updatedAt). Sent back as `expectedLastEdit`
   *  on the next PATCH so the server can detect (and reject) a concurrent
   *  edit instead of silently overwriting it — see updateProduct(). */
  lastEdit: IsoDateTime;
  dateCreated: IsoDateTime;
  images: ProductImage[];
  variants: ProductVariant[];
  primaryCategory?: Category;
  /** Additional (non-canonical) category placements. */
  categoryLinks?: { categoryID: UUID; category: Pick<Category, 'id' | 'nameEn' | 'nameAr' | 'slug'> }[];
  /** Manual collection memberships (Stage 1: manual only). */
  collectionLinks?: { collectionID: UUID; collection: Pick<Collection, 'id' | 'nameEn' | 'nameAr' | 'slug'> }[];
}

// ---- Promotions & coupons ----
// Stage 2 of the catalog redesign — Promotion replaces the old single-scope
// Discount model outright (one promotion can target any mix of products,
// categories — optionally including their descendants — and collections at
// once). Coupon (a separate checkout-code discount) is untouched.

/** A promotion as applied to one product (percentage or amount off, and
 *  whether it combines with the product's own sale). */
export interface AppliedPromotionInfo {
  nameEn: string;
  nameAr: string;
  type: DiscountType;
  value: number;
  /** true = applies on top of the product's own sale (the old STACK);
   *  false = replaces it, discounting the original price instead (the old
   *  OVERRIDE). Governs only this interaction — promotions never combine
   *  with each other; see PromotionBody.priority. */
  stackable: boolean;
  /** Which target actually matched this product — ALL (site-wide),
   *  PRODUCT (picked individually), or COLLECTION/CATEGORY (via one of the
   *  promotion's targets, named by sourceNameEn/sourceNameAr below). */
  source: 'ALL' | 'PRODUCT' | 'COLLECTION' | 'CATEGORY';
  sourceNameEn?: string | null;
  sourceNameAr?: string | null;
}

export type PromotionStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

/** Admin-managed promotion (`GET /api/promotions`). */
export interface Promotion {
  id: UUID;
  nameEn: string;
  nameAr: string;
  status: PromotionStatus;
  type: DiscountType;
  value: Decimalish;
  /** Single-winner-by-priority: among every ACTIVE, in-window promotion
   *  covering a product, the highest number wins outright — no implicit
   *  specificity. */
  priority: number;
  stackable: boolean;
  /** Site-wide — covers every product, no targets needed. Mutually
   *  exclusive with having any target below. */
  appliesToAll: boolean;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
  dateCreated: IsoDateTime;
  products: { productID: UUID; product: Pick<Product, 'id' | 'nameEn' | 'nameAr' | 'sku'> }[];
  categories: {
    categoryID: UUID;
    includeDescendants: boolean;
    category: Pick<Category, 'id' | 'nameEn' | 'nameAr' | 'slug'>;
  }[];
  collections: { collectionID: UUID; collection: Pick<Collection, 'id' | 'nameEn' | 'nameAr' | 'slug'> }[];
}

export interface PromotionCategoryTarget {
  categoryId: UUID;
  includeDescendants: boolean;
}

export interface PromotionBody {
  nameEn: string;
  nameAr: string;
  status?: PromotionStatus;
  type: DiscountType;
  value: number;
  priority?: number;
  stackable?: boolean;
  appliesToAll?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  productIds?: UUID[];
  categoryTargets?: PromotionCategoryTarget[];
  collectionIds?: UUID[];
}

/** Admin-managed checkout coupon (`GET /api/coupons`). */
export interface Coupon {
  id: UUID;
  code: string;
  type: DiscountType;
  value: Decimalish;
  isActive: boolean;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
  /** Usage caps — null = unlimited. */
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  timesRedeemed: number;
  dateCreated: IsoDateTime;
}

export interface CouponBody {
  /** Omit on create to have the server auto-generate a unique code. */
  code?: string;
  type: DiscountType;
  value: number;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  maxPerCustomer?: number | null;
}

export type LoyaltyMetric = 'ORDER_COUNT' | 'TOTAL_SPENT';

/** Admin-configured "reward every N orders / $N spent" rule
 *  (`GET /api/loyalty-rules`). Registered customers only — see the backend
 *  LoyaltyRule model's doc comment. Repeating: milestone 2 fires at
 *  2 x threshold, milestone 3 at 3 x threshold, and so on. */
export interface LoyaltyRule {
  id: UUID;
  nameEn: string;
  nameAr: string;
  metric: LoyaltyMetric;
  threshold: Decimalish;
  isActive: boolean;
  rewardType: DiscountType;
  rewardValue: Decimalish;
  /** How long the auto-issued coupon stays redeemable; null = no expiry. */
  couponValidDays: number | null;
  dateCreated: IsoDateTime;
}

export interface LoyaltyRuleBody {
  nameEn: string;
  nameAr: string;
  metric: LoyaltyMetric;
  threshold: number;
  isActive?: boolean;
  rewardType: DiscountType;
  rewardValue: number;
  couponValidDays?: number | null;
}

/** `POST /api/coupons/validate` success payload. */
export interface ResolvedCoupon {
  code: string;
  type: DiscountType;
  value: number;
}

// ---- Cart ----

export interface CartItem {
  id: UUID;
  cartID: UUID;
  variantID: UUID;
  quantity: number;
  /** Effective unit price the API computed for this line — variant override →
   *  product sale → catalog discount. Falls back to product pricing if absent. */
  effectivePrice?: number;
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
  /** req.ip at checkout time — admin-only context, not shown to customers. */
  ipAddress?: string | null;
  /** Soft anti-abuse flag: an order-velocity threshold was crossed. The
   *  order is created normally either way — see PATCH .../review. */
  flaggedForReview?: boolean;
  /** e.g. "velocity:phone,velocity:ip" — which threshold(s) tripped. */
  flaggedReason?: string | null;
  // Delivery snapshot captured at order time (see schema §2.4).
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  /** Lebanese governorate (one of the DELIVERY_REGIONS values). */
  deliveryRegion?: string | null;
  deliveryArea?: string | null;
  deliveryNotes?: string | null;
  notes?: string | null;
  /** Admin-set "arrives in about N days" estimate; set on/after shipping. */
  estimatedDeliveryDays?: number | null;
  /** Merchandise after per-product sales + catalog discounts, before any coupon. */
  subtotal: Decimalish;
  /** The coupon applied at checkout (upper-cased), or null. */
  couponCode?: string | null;
  /** Amount the coupon took off the subtotal. */
  discountAmount?: Decimalish;
  /** Admin-configured delivery fee. `total = subtotal - discountAmount + deliveryFee`. */
  deliveryFee: Decimalish;
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
  /** Signed-in shoppers only: persist a freshly-typed address to the
   *  address book. Ignored with `addressId` or for guests. */
  saveAddress?: boolean;
  guestEmail?: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryArea?: string;
  deliveryNotes?: string;
  notes?: string;
  /** The "verified" ticket from POST /api/checkout/otp/verify. Required
   *  unless the caller is logged in with a verified account email. */
  emailVerifyToken?: string;
  /** Optional coupon code; rejected at checkout if not currently valid. */
  couponCode?: string;
  /** The cart's own `subtotal` as last fetched — lets the server detect a
   *  price change (e.g. an admin edit) since this was shown and reject
   *  instead of silently charging the new number. */
  expectedSubtotal?: number;
}

/** `GET /api/orders/delivery-quote?region=...` — a live fee estimate for the
 *  caller's current cart. `freeReason` explains a zero fee. */
export interface DeliveryQuote {
  subtotal: number;
  deliveryFee: number;
  total: number;
  freeReason: 'disabled' | 'threshold' | 'region' | null;
}

// ---- Auth / account ----

export interface Address {
  id: UUID;
  userID: UUID;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  /** Lebanese governorate (one of the DELIVERY_REGIONS values). */
  region?: string | null;
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
  /** Effective admin permission keys (`<area>:view` / `<area>:manage`),
   *  resolved server-side from role + assigned custom role − revokes.
   *  ADMIN holds every key unless one was explicitly revoked. */
  permissions?: string[];
  /** Name of the assigned custom role (STAFF), else null. */
  roleName?: string | null;
}

// ---- RBAC (admin roles & permissions) ----

export type PermissionLevel = 'view' | 'manage';

export interface PermissionArea {
  area: string;
  label: string;
  levels: PermissionLevel[];
}

/** Admin-managed role (`GET /api/admin/roles`). */
export interface Role {
  id: UUID;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  dateCreated: IsoDateTime;
  _count?: { users: number };
}

export interface RoleBody {
  name: string;
  description?: string | null;
  permissions: string[];
}

/** One STAFF/ADMIN account on the Team tab. */
export interface TeamMember {
  id: UUID;
  name: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  revokedPermissions: string[];
  customRole: { id: UUID; name: string } | null;
  effectivePermissions: string[];
}

/** New admin-created team account (`POST /api/admin/team`). */
export interface NewTeamMember {
  name: string;
  email: string;
  password: string;
  role: 'STAFF' | 'ADMIN';
  roleId?: string | null;
}

// ---- Customers (admin directory of registered shoppers) ----

export type CustomerSort = 'newest' | 'oldest' | 'name' | 'orders';

export interface CustomerListQuery {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
}

/** One row in `GET /api/admin/customers`. `totalSpent` / order tallies exclude
 *  cancelled + returned orders. */
export interface AdminCustomerSummary {
  id: UUID;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  emailVerified: boolean;
  joinedAt: IsoDateTime;
  /** Every order ever placed, whatever its status. */
  orderCount: number;
  /** Orders that count toward spend (not cancelled / returned). */
  paidOrderCount: number;
  totalSpent: Decimalish;
  lastOrderAt: IsoDateTime | null;
}

export interface AdminCustomerListResponse {
  customers: AdminCustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** `GET /api/admin/customers/:id` — the summary fields plus the full order
 *  history (newest first, line items included). */
export interface AdminCustomerDetail extends AdminCustomerSummary {
  orders: Order[];
}

// ---- Blacklist (anti-abuse block list, GET/POST/DELETE /api/admin/blacklist) ----
// Checked at checkout-OTP request time and at order creation (phone/email/IP).
// Every route here needs orders:manage, not just orders:view.

export type BlacklistType = 'PHONE' | 'EMAIL' | 'IP';

export interface BlacklistEntry {
  id: UUID;
  type: BlacklistType;
  /** Normalized server-side: an EMAIL is lower-cased; PHONE/IP are stored as
   *  entered. */
  value: string;
  reason?: string | null;
  createdAt: IsoDateTime;
  /** Absent if the admin who created it was later deleted. */
  creator?: { name: string; email: string } | null;
}

export interface BlacklistEntryBody {
  type: BlacklistType;
  value: string;
  reason?: string;
}

// ---- Product list query (GET /api/products) ----

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'best_selling';

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
  /** Only products discounted right now (own sale or an active catalog discount). */
  onSale?: boolean;
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

/** One per-governorate delivery-fee override. */
export interface DeliveryRate {
  id: UUID;
  region: string;
  fee: Decimalish;
  sortOrder: number;
}

/** One open day of a store location's schedule. `dayOfWeek` is 0 = Monday …
 *  6 = Sunday; a day with no entry is closed. Times are "HH:MM" (24-hour). */
export interface StoreHoursDay {
  id: UUID;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

/** One admin-uploaded customer-review screenshot (home page review strip). */
export interface ReviewImage {
  id: UUID;
  imageUrl: string;
  imageFileId: string | null;
  sortOrder: number;
}

/** Built-in "smart" home-page rows — a computed product list the owner can
 *  turn on and slot into the featured-row order without a real category. */
export type ShowcaseType = 'BEST_SELLERS' | 'NEW_ARRIVALS' | 'ON_SALE';

export interface HomeShowcase {
  type: ShowcaseType;
  isActive: boolean;
  /** Shared ranking key with featured collections / categories. */
  sortOrder: number;
  /** Overrides the default heading; empty ⇒ the built-in label. */
  labelEn: string | null;
  labelAr: string | null;
}

/** A physical store shown in the home page's "Visit us" section. */
export interface StoreLocation {
  id: UUID;
  nameEn: string | null;
  nameAr: string | null;
  addressEn: string | null;
  addressAr: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  imageFileId: string | null;
  sortOrder: number;
  hours: StoreHoursDay[];
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
  /** Optional "Our story" page — null in a language ⇒ fall back to the other;
   *  all four null ⇒ the page and its footer link are hidden. */
  storyTitleEn: string | null;
  storyTitleAr: string | null;
  storyBodyEn: string | null;
  storyBodyAr: string | null;
  /** Optional image shown beside the "Our story" text. */
  storyImageUrl: string | null;
  storyImageFileId: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  whatsappUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Sender identity for outgoing customer/owner email — null falls back to
   *  SMTP_FROM from the environment (see backend lib/mailer.ts). */
  mailFromName: string | null;
  mailFromEmail: string | null;
  announcementLines: AnnouncementLine[];
  /** Physical stores shown in the home page's "Visit us" section. */
  storeLocations: StoreLocation[];
  /** Customer-review screenshots shown in the home page's review strip. */
  reviewImages: ReviewImage[];
  /** Built-in smart home rows (best sellers / new / on sale), by `sortOrder`. */
  showcases: HomeShowcase[];
  /** Resolved collection for the hero CTA, when one is set. */
  heroCtaCollection: Pick<Collection, 'id' | 'slug' | 'nameEn' | 'nameAr'> | null;
  // Delivery fee — off ⇒ every order ships free.
  deliveryFeeEnabled: boolean;
  deliveryFeeFlat: Decimalish;
  freeDeliveryThreshold: Decimalish | null;
  freeDeliveryRegions: string[];
  deliveryRates: DeliveryRate[];
}

/** Partial patch — every field optional; `''` clears a nullable field;
 *  `announcementLines` / `deliveryRates` replace the whole list. */
export type SiteSettingsBody = Partial<
  Omit<
    SiteSettings,
    | 'id'
    | 'announcementLines'
    | 'heroCtaCollection'
    | 'heroCtaCollectionID'
    | 'deliveryRates'
    | 'freeDeliveryThreshold'
    | 'storeLocations'
    | 'reviewImages'
    | 'showcases'
  >
> & {
  heroCtaCollectionId?: UUID | '' | null;
  announcementLines?: { textEn: string; textAr: string }[];
  deliveryRates?: { region: string; fee: number }[];
  /** Replace-all: the whole customer-review strip, in order. */
  reviewImages?: { imageUrl: string; imageFileId?: string | null }[];
  /** Upsert by `type`: the built-in smart home rows. */
  showcases?: {
    type: ShowcaseType;
    isActive: boolean;
    sortOrder: number;
    labelEn?: string | null;
    labelAr?: string | null;
  }[];
  /** number ⇒ set; null ⇒ clear the free-over rule. */
  freeDeliveryThreshold?: number | null;
  /** Replace-all: the whole set of stores, in order. Each carries its own
   *  open days (a day left out is closed). */
  storeLocations?: {
    nameEn?: string | null;
    nameAr?: string | null;
    addressEn?: string | null;
    addressAr?: string | null;
    mapUrl?: string | null;
    imageUrl?: string | null;
    imageFileId?: string | null;
    hours?: { dayOfWeek: number; opensAt: string; closesAt: string }[];
  }[];
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
    region?: string;
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

/** Requests an account email change — the current password is required and
 *  verified server-side, same bar as ChangePasswordBody. A confirmation link
 *  is sent to `newEmail`; nothing changes until that link is clicked. */
export interface RequestEmailChangeBody {
  newEmail: string;
  currentPassword: string;
  locale?: 'en' | 'ar';
}

export interface ConfirmEmailChangeBody {
  token: string;
}

export interface SmtpStatus {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  user: string | null;
  updatedAt: string | null;
}

/** Admin panel's "outgoing mail account" form — a Gmail address + app
 *  password (see backend smtp-credential.service.ts). */
export interface SetSmtpCredentialBody {
  email: string;
  appPassword: string;
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
  type?: CollectionType;
  // TODO(admin-collections): expose showInNav / showOnHome / sortOrder / accentColor in the admin form.
  showInNav?: boolean;
  showOnHome?: boolean;
  showOnHomeAsImage?: boolean;
  sortOrder?: number;
  homeSortOrder?: number;
  accentColor?: string | null;
  homeImageCtaEn?: string | null;
  homeImageCtaAr?: string | null;
}

export interface CategoryBody {
  /** Omit or `null` for a root category; `null` on update makes an existing
   *  category a root. */
  parentId?: UUID | null;
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  isActive?: boolean;
  showOnHome?: boolean;
  sortOrder?: number;
  homeSortOrder?: number;
  showInNav?: boolean;
  showOnHomeAsImage?: boolean;
  accentColor?: string | null;
  homeImageCtaEn?: string | null;
  homeImageCtaAr?: string | null;
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
  primaryCategoryId: UUID;
  /** Additional (non-canonical) category placements. */
  additionalCategoryIds?: UUID[];
  /** Manual collection memberships (Stage 1: manual only). */
  collectionIds?: UUID[];
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
  region?: string;
  area?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface ProfileBody {
  name?: string;
  phone?: string | null;
}

export interface AdminDashboardRecentOrder {
  id: UUID;
  orderNumber: string;
  deliveryName: string;
  total: Decimalish;
  /** Coupon reduction on this order (0 when none). */
  discountAmount?: Decimalish;
  couponCode?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  flaggedForReview: boolean;
  dateCreated: string;
}

export interface AdminDashboard {
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  /** Orders an anti-abuse velocity check flagged, not yet cleared by an admin. */
  flaggedOrders: number;
  /** Delivered COD orders whose cash hasn't been marked collected. */
  awaitingCodCollection: number;
  /** Active variants with 1–5 units left. */
  lowStockVariants: number;
  /** Active variants at 0 or fewer units. */
  outOfStockVariants: number;
  /** The 8 most recent orders, newest first. */
  recentOrders: AdminDashboardRecentOrder[];
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
    deliveryRevenue: number;
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

# Robust E-commerce Catalog Architecture

## The core idea

You are not missing more nested collection fields. You are mixing two different concepts that should be separate:

1. **Categories** are the permanent navigation tree: `Men → Shoes → Sport Shoes`.
2. **Collections** are flexible merchandising groups: `Sale`, `New Arrivals`, `Ramadan Picks`, `Nike Running`, `Under $50`.

A robust commerce architecture uses a tree for categories, then separate many-to-many grouping and promotion models for everything that cuts across that tree.

---

## The right mental model

```text
CATEGORY TREE — stable navigation

Root
└── Men
    └── Shoes
        └── Sport Shoes
            ├── Running Shoes
            ├── Football Shoes
            └── Basketball Shoes


PRODUCT MEMBERSHIP — flexible

Product: Nike Air Zoom Pegasus
Primary category: Running Shoes
Also appears in:
- Sport Shoes
- Sale
- New Arrivals
- Nike
- Back to School
```

| Requirement | Use | Example |
|---|---|---|
| Permanent browsing hierarchy | Category | Men → Shoes → Sport Shoes |
| Unlimited nesting | Self-referencing `Category.parentID` | Sport Shoes is a child of Shoes |
| Product displayed in several normal navigation locations | Product-category join table | A unisex shoe in both Men and Women |
| Temporary campaign | Collection | Summer Sale 2026 |
| Hand-picked group | Manual collection membership | “Top 10 Picks” |
| Automatically calculated group | Rule-based collection | Products discounted by at least 20% |
| Actual price reduction | Promotion | 20% off all running shoes |
| Sale landing page | Automated collection | Any product with an active price reduction |

Do not force every product group into `Collection → Category → Product`. Categories and collections have different jobs.

---

# 1. Category tree

Use one self-referencing `Category` table with unlimited depth. Do not use Collection and Category as separate levels of one mandatory hierarchy.

```prisma
model Category {
  id            String    @id @default(uuid()) @db.Uuid
  parentID      String?   @db.Uuid

  nameEn        String
  nameAr        String?
  slug          String
  descriptionEn String?
  descriptionAr String?

  isActive      Boolean   @default(true)
  isVisible     Boolean   @default(true)
  sortOrder     Int       @default(0)
  imageUrl      String?
  imageFileId   String?

  // Denormalized helpers, maintained in a transaction or DB trigger.
  depth         Int       @default(0)
  path          String    @default("") // e.g. /men/shoes/sport-shoes/
  archivedAt    DateTime?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  parent        Category?  @relation("CategoryTree", fields: [parentID], references: [id], onDelete: Restrict)
  children      Category[] @relation("CategoryTree")

  productLinks      ProductCategory[]
  promotionTargets  PromotionCategory[]

  @@unique([parentID, slug])
  @@index([parentID, sortOrder])
  @@index([path])
  @@index([isActive, isVisible])
  @@map("category")
}
```

This supports any depth without a schema change:

```text
Men
└── Shoes
    └── Sport Shoes
        └── Running Shoes
            └── Trail Running Shoes
```

## How `parentID` creates nesting

A root category has `parentID = null`.

```text
Men.parentID = null
Shoes.parentID = Men.id
Sport Shoes.parentID = Shoes.id
Running Shoes.parentID = Sport Shoes.id
```

## Why retain `path` and `depth`

`parentID` is the source of truth. `path` and `depth` are performance helpers.

```text
path  = /men/shoes/sport-shoes/
depth = 3
```

To find all category descendants of Men:

```sql
WHERE path LIKE '/men/%'
```

Update `path` and `depth` transactionally when a category moves or is renamed.

## Rules to enforce

Your backend or a database trigger must reject:

- A category being its own parent.
- A category becoming the parent of one of its own descendants.
- Circular paths such as `Men → Shoes → Men`.
- New products being assigned to archived categories.
- Duplicate sibling slugs.

A UI should normally limit visible category depth to around three or four levels, even if the database supports more.

---

# 2. Products and categories

A professional catalog should support:

- One **primary category** for canonical URLs, breadcrumbs, reporting, and default placement.
- Zero or more **additional category memberships** for products that belong in several browsing paths.

```prisma
model Product {
  id                String        @id @default(uuid()) @db.Uuid
  sku               String        @unique

  nameEn            String
  nameAr            String?
  descriptionEn     String?
  descriptionAr     String?

  status            ProductStatus @default(DRAFT)
  primaryCategoryID String?       @db.Uuid

  brandID           String?       @db.Uuid
  basePrice         Decimal       @db.Decimal(12, 2)
  compareAtPrice    Decimal?      @db.Decimal(12, 2)
  currency          String        @default("USD")

  publishedAt       DateTime?
  archivedAt        DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  primaryCategory   Category? @relation(
    "PrimaryProductCategory",
    fields: [primaryCategoryID],
    references: [id],
    onDelete: SetNull
  )

  categoryLinks     ProductCategory[]
  collectionLinks   CollectionProduct[]
  variants          ProductVariant[]
  promotionTargets  PromotionProduct[]

  @@index([primaryCategoryID])
  @@index([status, publishedAt])
  @@map("product")
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model ProductCategory {
  productID   String   @db.Uuid
  categoryID  String   @db.Uuid
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  product     Product  @relation(fields: [productID], references: [id], onDelete: Cascade)
  category    Category @relation(fields: [categoryID], references: [id], onDelete: Restrict)

  @@id([productID, categoryID])
  @@index([categoryID, sortOrder])
  @@map("productcategory")
}
```

Example:

```text
Product: Black Running Shoe

Primary category:
Men → Shoes → Sport Shoes → Running Shoes

Additional category link:
Women → Shoes → Sport Shoes → Running Shoes
```

This is still one product, with one set of variants, stock, pricing, order history, and images. Do not duplicate product records simply to display a product in several categories.

## Why a primary category matters

Many-to-many membership needs one canonical choice for:

- The default product URL.
- Breadcrumbs when the user reaches a product directly.
- Search-engine canonical metadata.
- Category sales reporting.
- Default placement if no category context exists.

```text
Canonical URL:
/men/shoes/sport-shoes/running-shoes/nike-air-zoom-pegasus

Alternative browsing placement:
/women/shoes/sport-shoes/running-shoes/nike-air-zoom-pegasus
```

The alternative route should redirect to the canonical URL or emit a canonical link to it.

---

# 3. Collections

A collection is a flexible product group. It is not part of the permanent category tree.

Examples:

```text
Sale
New Arrivals
Best Sellers
Summer Essentials
Ramadan Collection
Under $30
Nike
Back to School
Winter Clearance
```

Use three membership modes:

1. **Manual** — the admin explicitly chooses products.
2. **Automated** — products are included because they match rules.
3. **Hybrid** — automated products plus manual includes and exclusions.

```prisma
enum CollectionType {
  MANUAL
  AUTOMATED
  HYBRID
}

enum CollectionMembership {
  INCLUDE
  EXCLUDE
}

model Collection {
  id            String         @id @default(uuid()) @db.Uuid
  nameEn        String
  nameAr        String?
  slug          String         @unique
  descriptionEn String?
  descriptionAr String?

  type          CollectionType @default(MANUAL)
  isActive      Boolean        @default(true)
  isVisible     Boolean        @default(true)
  sortOrder     Int            @default(0)

  imageUrl      String?
  imageFileId   String?
  startsAt      DateTime?
  endsAt        DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  archivedAt    DateTime?

  products      CollectionProduct[]
  rules         CollectionRule[]

  @@index([type, isActive])
  @@index([startsAt, endsAt])
  @@map("collection")
}

model CollectionProduct {
  collectionID String   @db.Uuid
  productID    String   @db.Uuid
  membership   CollectionMembership @default(INCLUDE)
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())

  collection   Collection @relation(fields: [collectionID], references: [id], onDelete: Cascade)
  product      Product    @relation(fields: [productID], references: [id], onDelete: Cascade)

  @@id([collectionID, productID])
  @@index([productID])
  @@map("collectionproduct")
}
```

---

# 4. Automated collection rules

Never store raw SQL or arbitrary JavaScript supplied by an admin. Store structured, validated rules and translate them safely in your backend.

```prisma
enum CollectionRuleField {
  PRODUCT_STATUS
  BRAND
  CATEGORY
  PRICE
  COMPARE_AT_PRICE
  HAS_ACTIVE_PROMOTION
  CREATED_AT
  TAG
  STOCK_STATUS
}

enum CollectionRuleOperator {
  EQUALS
  NOT_EQUALS
  GREATER_THAN
  GREATER_THAN_OR_EQUAL
  LESS_THAN
  LESS_THAN_OR_EQUAL
  IN
  NOT_IN
  EXISTS
}

model CollectionRule {
  id           String                 @id @default(uuid()) @db.Uuid
  collectionID String                 @db.Uuid
  groupNumber  Int                    @default(0)
  field        CollectionRuleField
  operator     CollectionRuleOperator
  value        Json?
  sortOrder    Int                    @default(0)

  collection   Collection             @relation(fields: [collectionID], references: [id], onDelete: Cascade)

  @@index([collectionID, groupNumber, sortOrder])
  @@map("collectionrule")
}
```

Example automated **Sale** collection:

```text
Collection:
  name: Sale
  type: AUTOMATED

Rule:
  field: HAS_ACTIVE_PROMOTION
  operator: EXISTS
```

Example automated **Men's Running Shoes Under $100** collection:

```text
Rules:
  category IN [Running Shoes ID]
  price LESS_THAN_OR_EQUAL 100
  product status EQUALS ACTIVE
```

---

# 5. Promotions and sale prices

A **promotion** changes a price. A **Sale collection** displays the products affected by a promotion.

```text
Promotion:
  “Summer Sale — 20% off sport shoes”
  Determines eligibility and discount amount.

Sale collection:
  “Sale”
  Automatically displays all products with an active effective reduction.
```

This prevents manually adding and removing products from a sale page every time a promotion begins or ends.

```prisma
enum PromotionStatus {
  DRAFT
  ACTIVE
  PAUSED
  ENDED
}

enum DiscountType {
  PERCENT
  FIXED_AMOUNT
}

model Promotion {
  id             String          @id @default(uuid()) @db.Uuid
  name           String
  status         PromotionStatus @default(DRAFT)

  discountType   DiscountType
  discountValue  Decimal         @db.Decimal(12, 2)

  startsAt       DateTime?
  endsAt         DateTime?
  priority       Int             @default(0)
  stackable      Boolean         @default(false)

  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  products       PromotionProduct[]
  categories     PromotionCategory[]
  collections    PromotionCollection[]

  @@index([status, startsAt, endsAt])
  @@map("promotion")
}

model PromotionProduct {
  promotionID String @db.Uuid
  productID   String @db.Uuid

  promotion Promotion @relation(fields: [promotionID], references: [id], onDelete: Cascade)
  product   Product   @relation(fields: [productID], references: [id], onDelete: Cascade)

  @@id([promotionID, productID])
  @@map("promotionproduct")
}

model PromotionCategory {
  promotionID        String   @db.Uuid
  categoryID         String   @db.Uuid
  includeDescendants Boolean  @default(true)

  promotion Promotion @relation(fields: [promotionID], references: [id], onDelete: Cascade)
  category  Category  @relation(fields: [categoryID], references: [id], onDelete: Restrict)

  @@id([promotionID, categoryID])
  @@map("promotioncategory")
}

model PromotionCollection {
  promotionID  String @db.Uuid
  collectionID String @db.Uuid

  promotion  Promotion  @relation(fields: [promotionID], references: [id], onDelete: Cascade)
  collection Collection @relation(fields: [collectionID], references: [id], onDelete: Restrict)

  @@id([promotionID, collectionID])
  @@map("promotioncollection")
}
```

Example: **20% off Sport Shoes**

```text
Promotion:
  Name: Sport Shoes Sale
  Status: ACTIVE
  Discount: 20% off
  Starts: 2026-09-15
  Ends: 2026-09-30
  Stackable: false
  Priority: 100

Promotion target:
  Category: Sport Shoes
  Include descendants: true
```

The promotion applies to products in:

```text
Men → Shoes → Sport Shoes
├── Running Shoes
├── Football Shoes
└── Basketball Shoes
```

The automatic `Sale` collection then shows every product whose final effective price is lower than its regular price.

---

# Recommended architecture

```text
Category
├── Self-referencing tree
├── Unlimited nesting
├── Used for permanent navigation
└── Parent/child structure only

Product
├── One primary category
├── Zero or more additional categories
├── Variants own stock
└── Does not store collectionID directly

Collection
├── Separate from the category tree
├── Manual, automated, or hybrid
├── Groups products across categories
└── Used for campaign and merchandising pages

Promotion
├── Determines actual price reductions
├── Targets products, categories, or collections
├── Supports schedules, priority, and stacking rules
└── Drives effective selling price

ProductVariant
├── Owns SKU
├── Owns stock quantity
├── May override the product price
└── Is the sole inventory unit
```

## Final implementation rules

1. Use self-referencing categories for `Men → Shoes → Sport Shoes → Product`.
2. Remove `Product.collectionID`; collections should not be a direct product parent.
3. Use `ProductCategory` for many-to-many category placement.
4. Keep `Product.primaryCategoryID` for canonical navigation, breadcrumbs, and reporting.
5. Use `CollectionProduct` for manually grouped products.
6. Use `CollectionRule` for safely calculated product groups.
7. Use `Promotion` records to calculate discounts.
8. Implement `Sale` as an automated collection, not as the entity responsible for changing prices.
9. Keep inventory on `ProductVariant` only. For a product with no visible options, create one default variant with null size and color.

This supports both the simple case now and future merchandising without needing a taxonomy redesign.

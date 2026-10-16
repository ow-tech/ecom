# Catalogue Foundation

## Status

Implemented.

## Model and ownership

`Category -> Product -> ProductVariant` is platform-owned catalogue data.
`SupplierListing` is the supplier-owned commercial offer, reached through the
Supplier one-to-one Organization extension. Products deliberately contain no
supplier, price, stock, supplier SKU, commission, or fulfilment fields. Product
media is platform-owned metadata (`storageKey`, optional URL, alt text and order);
binary upload and object storage remain deferred.

## Authorization and permissions

Platform category and product APIs use `RbacService.requirePlatform` with
`platform.categories.read/manage` and `platform.products.read/manage`.
Supplier listing APIs use `RbacService.organizationContext` and derive the Supplier
from the verified Organization, never a client supplier ID. Organization owner and
admin receive `catalogue.listings.read/create/update/activate`; member receives read.

## Lifecycle and integrity

Listings begin `DRAFT`. `DRAFT -> ACTIVE`, `ACTIVE -> INACTIVE`, and
`INACTIVE -> ACTIVE` use explicit lifecycle endpoints. Activation requires ACTIVE
Supplier, Product, and optional Variant plus a positive Decimal price and uppercase
three-letter currency. Product/variant bindings are immutable after listing creation.
The forward migration uses `DECIMAL(18,2)`, never floating point. Its PostgreSQL
expression unique index normalizes a NULL variant to a UUID sentinel, protecting one
offer per supplier/product/variant including the non-variant case.

## APIs

- `GET|POST /platform/categories`, `GET|PATCH /platform/categories/:categoryId`
- `GET|POST /platform/products`, `GET|PATCH /platform/products/:productId`
- `GET|POST /platform/products/:productId/variants`, `PATCH .../variants/:variantId`
- `GET|POST /platform/products/:productId/media`, `PATCH .../media/:mediaId`
- `GET|POST /organizations/:organizationId/listings`, `GET|PATCH .../:listingId`
- `POST .../:listingId/activate` and `POST .../:listingId/deactivate`

## Tests and limitations

The real Nest HTTP/PostgreSQL catalogue integration suite covers platform RBAC,
category hierarchy, product and SKU uniqueness, tenant isolation, immutable listing
ownership/bindings, lifecycle eligibility, and media metadata. No inventory, upload
storage, storefront, cart, checkout, orders, fulfilment, or supplier-specific media
is implemented.

## Safe continuation point

Inventory Foundation should add `InventoryLocation -> InventoryItem/StockLevel ->
InventoryMovement` without placing quantity on Product or SupplierListing. Preserve
the platform-catalogue/supplier-offer split and the verified Organization context.

## Storefront browsing refinement

The public browser keeps its category, search, and pagination state in the URL.
Category routing and selection use the category slug as the canonical storefront
identifier; database category IDs must never be compared with route category values.
Category changes are normalized to `/products?category=...`, reset pagination,
and retain search. A scrollable category rail uses real links, optimistic active
`aria-current` state, touch scrolling, horizontal-only selected-item reveal, and
disabled directional controls. It does not scroll or reposition the document.
After the initial ProductCard-shaped skeleton, later requests retain the current grid
under a quiet progress state. A request generation fence means an older response
cannot overwrite a newer category choice.

One deterministic category-theme resolver supplies catalogue accent, soft background,
and readable foreground values to the rail, catalogue header, category cards, and
product category markers. Known categories use the approved category tokens and new
categories receive a stable palette fallback. These accents decorate catalogue context;
global page, navigation, account, checkout, and commerce-action identity stays unchanged.

## Public product filters

`GET /catalogue/products` accepts `category`, `search`, `supplier`, `currency`,
`minPrice`, `maxPrice`, `sort`, `page`, and `limit`. Supplier and currency only
project active, in-stock public offers. Price comparison is Decimal-based and
requires the selected currency in the storefront; sorting happens on the
server-side product/eligible-offer result before pagination. The response
includes customer-safe supplier/currency filter metadata alongside the filtered
product page.

The storefront renders that query contract through shared sidebar/drawer
controls, with URL state as the authority and a request generation fence for
results. Reversed price bounds are flagged inline instead of being presented as
an unexplained empty result. A fresh PostgreSQL 16/Nest HTTP suite covers
category/supplier/currency/decimal-price filtering, sorting, offer grouping,
eligibility exclusion, exact totals, and deterministic pagination. React tests
also use deferred responses to prove the latest request wins. Responsive browser
verification remains release verification work.

## QA gallery fixtures

The idempotent local QA seed creates three ordered image records for every QA
product. The product-detail gallery therefore has real thumbnails to exercise
selection and carousel behavior without changing the public catalogue contract.

## Live storefront search

The paginated public product endpoint remains the only search source. The browser
waits 400ms and requires two meaningful characters, then reuses that response for
suggestions and grid data. It aborts and fences obsolete requests, keeps a short
bounded client cache by full filter query, and preserves server validation,
pagination, eligibility, and sorting. Browser viewport proof remains pending.

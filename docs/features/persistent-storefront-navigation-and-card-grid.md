# Persistent customer navigation and five-card catalogue layout

Status: IMPLEMENTED_REMOTE — GitHub CI and real customer browser QA remain release gates.

## Problem and contract

Historically each customer page rendered its own `StorefrontHeader`, while
`/account` omitted it, leaving shoppers without an obvious route back to
products. The new shared `CustomerNavigation` is mounted in the root layout
inside SessionProvider + CartProvider, so it survives client navigation across
storefront, products, categories, cart, checkout/payment, login and every account
subpage. Individual customer pages must **not** mount a second header.

The supplier, platform, and dedicated workforce routes retain their
permission-aware workspace/auth layouts. The customer shell deliberately hides
its header for `/supplier[/...]`, `/platform[/...]` and `/staff[/...]`.

The persistent customer navbar always exposes **Shop** and (on suitably wide
screens) **Products**. The Ecom logo also returns home; account overview offers
**Continue shopping**. Cart, notifications, account and sign-out actions retain
their established session behavior, with responsive spacing.

## Responsive card rules

The catalogue surface uses a wider maximum content width, retaining the left
filter sidebar on desktops. Product listing and loading skeleton grids use
1 mobile / 2 small / 3 medium / 4 large / **5 extra-large** columns.
Product cards are stretch-aligned to the grid row, with consistent image ratios,
two-line capped titles, flexible card bodies, anchored price and stock footer.
Overseas estimate text is capped at two lines to avoid irregular heights.
Category cards also support five aligned columns at extra-large width.
Existing category theming, accessible product links, and supplier offers are
preserved.

## Checks

- React tests: shared header appears once for storefront, products, category,
  account subpages, cart/checkout and auth; remains hidden for separate staff
  workspaces; works after route switches.
- Catalogue test: five-column responsive class, stretch alignment, equal-height
  card composition and accessible product links for variable title lengths.
- Existing auth/cart/catalogue tests, TypeScript/lint/build and backend
  HTTP/PostgreSQL regressions run in CI.
- Manual browser QA: mobile widths 320/375/768, desktops 1280/1536,
  sticky nav on deep scrolling, navigation from account/support/checkout to Shop,
  no duplicate headers, no trapped back navigation, long product names,
  mixed currencies and overseas offers. Use current local data; do not reseed.

No schema or production changes required.

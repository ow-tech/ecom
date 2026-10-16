# Frontend design system

## Scope

The current storefront, customer account, supplier workspace, and platform
workspace use one frontend component system. This document records the source
of truth for the implemented routes; it does not add new commerce or payment
behaviour.

## Tokens and density

- Brand: primary `#26356B`, secondary `#167C80`, action `#E8663D`.
- Surfaces: page `#FAFAF8`, card `#FFFFFF`, text `#20242B`, muted `#667085`,
  and border `#E4E7EC`.
- Storefront uses the `StorefrontContainer` for a spacious commerce layout.
- Supplier and Platform use `WorkspaceShell`, `WorkspaceContainer`, and
  `WorkspaceNavItem`; Platform retains the same system at a denser operational
  information density.

## Canonical components

`components/ui.tsx` owns Button, Input, Textarea, Select, FormField, Label,
Card/Surface, Badge/StatusBadge, Alert, Skeleton, Spinner, EmptyState,
ErrorState, PageHeader, SectionHeader, SelectableCard, QuantityControl, Money,
OrderSummary, StorefrontContainer, WorkspaceContainer, and WorkspaceNavItem.

Feature components should compose these primitives instead of adding locally
styled equivalents. Product category accents are global semantic CSS tokens,
not raw hex values in feature components.

## Cart and checkout

Cart items use Card + QuantityControl + Money. Cart and Checkout both render
their totals with OrderSummary. Checkout uses SelectableCard for fulfilment,
address, and pickup choices, while all address fields use FormField/Input.
The flow remains server-authoritative: checkout only prepares the existing
pending order and does not start payment.

## Responsive and accessibility baseline

The shared containers use mobile-first padding; commerce and workspace grids
move to two-column layouts only at their existing large-screen breakpoints.
Interactive controls retain visible focus styles, controls have names, quantity
buttons have item-specific labels, and checkout choices expose pressed/radio
state to assistive technology.

## Storefront shopping feedback

After the canonical cart mutation confirms, product offers remain in place and
emit decorative fly-to-cart feedback using measured source and sticky-header
cart geometry. The header is shared only by storefront routes, stays visible
while scrolling, and presents a 44px cart target with an authoritative count
badge. Flights use the visible selected image when possible (otherwise the
action geometry), run for about 800ms desktop / 1000ms mobile, and are removed
when finished. The cart count is still derived from CartProvider state;
reduced-motion or unmeasurable geometry falls back to a cart pulse. A single
non-focus-stealing, four-second confirmation names the product and selected
variant, offers View cart and Dismiss, and is replaced on a newer success.
Catalogue category selection
uses URL query state, a touch-scrollable keyboard-link rail, and ProductCard-
shaped loading skeletons. The latest catalogue request wins, so stale responses
cannot replace a newer category. Cart continuation uses only a stored relative
`/products` URL (or the `/products` fallback), preserving safe filters.

## Storefront navigation refinement

The category rail keeps its scroll controls aligned with category chips on
desktop, uses measured boundary state, and leaves touch scrolling unobstructed
on small screens. Product detail uses a container-aligned Back to products
control and safe internal catalogue return paths. Cart continuation is a
secondary Button while checkout remains primary.

The same filter-content component is rendered in a persistent desktop sidebar
at `lg` and in the small-screen dialog. Both update the canonical URL query
state; price inputs remain disabled until an eligible-offer currency is chosen,
and a reversed price range receives accessible inline validation. Deferred-promise
React coverage protects the response-generation fence; this is not browser
viewport proof.

## Catalogue controls and live search

Catalogue Supplier, Currency, and Sort use the `BrandedSelect` primitive rather
than browser-owned option popups. Its body portal measures the trigger on
open/scroll/resize, flips when required, and stays inside the viewport. It has
labelled combobox/listbox semantics, keyboard and pointer selection, Escape and
outside dismissal, focus return, and selected checkmarks. The existing native
`Select` remains compatible for other surfaces.

Search updates immediately, applies a two-character query after 400ms, and uses
one catalogue page for both up-to-six suggestions and results. Superseded calls
are aborted and generation-fenced; a bounded 45-second non-account cache is
keyed by catalogue query. Typed URL changes replace history, while submit pushes.

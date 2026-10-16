# Delivery + Pickup

## Pickup points and checkout

PickupPoint is platform-owned and distinct from InventoryLocation. Super-admin has
`platform.pickup_points.read/manage`; customer-safe listing returns active points only.
Code and slug are unique, fees are nonnegative Decimal values, optional storage days
are positive, and points are deactivated rather than deleted.

PICKUP checkout requires an active point, derives its fee on the server, includes it in
`total`, snapshots name/address/city/region/phone/fee, and requires no delivery address.
Later PickupPoint edits do not change historical Orders.
`COLLECTION_CODE_SECRET` is required runtime configuration for deterministic customer
code recovery; plaintext codes are never stored.

## Delivery rating

Super-admin has `platform.delivery.read/manage/quote`. Active zones match normalized
country, optional region, and optional city, with the most specific match winning.
Only active same-currency rates apply; no FX or landmark guessing occurs. The selected
Decimal fee is finalized before payment and the owned delivery address is snapshotted.
Editing a saved address causes checkout to request a new preview for the same address
ID; the resolver therefore uses its current region/city fields. Once an Order exists,
later profile-address edits or deletion cannot change its `OrderDeliveryAddress`.

## Manual quote contract

No matching rate creates an Order and one `PENDING` DeliveryQuote in
`AWAITING_DELIVERY_QUOTE`. Paystack initialization rejects that Order. Platform quote
uses a current-state lock and records amount, actor, reason, and optional expiry.
Only the owning customer may approve a non-expired same-currency quote while unpaid and
still awaiting it. Approval atomically sets `APPROVED`, copies the fee, recalculates
`total = subtotal + deliveryFee`, returns the Order to `PENDING_PAYMENT`, and appends
history. Any existing Payment prevents total mutation. Payment is not auto-initialized.

Quote-waiting orders use the existing short reservation TTL. The expiry processor now
handles both pending-payment and awaiting-quote states, so unmatched delivery never
creates an indefinite stock lock.

## Verification and limits

Database checks protect money, status/timestamp consistency, currency, uniqueness, and
FKs. Integration covers platform authorization, active pickup visibility, address-edit
fee re-rating, snapshots,
server fee derivation, deterministic rating, quote blocking/approval/expiry/ownership,
final payment amount, collection, and reservation policy. No courier API, maps, routes,
GPS, delivery OTP, notification engine, or frontend UI exists.

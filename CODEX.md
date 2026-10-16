# Ecom Platform Guidance

Keep changes focused and preserve the documented architectural boundaries.
The backend owns business logic and all database access; browser code must not
connect to PostgreSQL or receive infrastructure credentials. Do not introduce
tenant, supplier, customer, or commerce schema until the identity and tenancy
foundation has been designed deliberately.

Before a feature, read `docs/PROJECT_STATE.md`, the relevant feature document,
and `docs/ARCHITECTURE.md`.
# Current checkout safety seam

Checkout pricing is previewed by the backend before prepare, and Paystack
channel selection is persisted and bound to provider evidence. Keep settlement
in `PaymentSettlementService`; do not treat browser callbacks as payment proof.

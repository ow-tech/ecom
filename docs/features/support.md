# Support

Customer tickets are tied to the authenticated customer's profile. Supplier tickets require `RbacService.organizationContext` and are constrained to the verified organization and supplier. Internal messages are only returned through platform support reads.

The lifecycle is explicit: `OPEN -> ASSIGNED -> IN_PROGRESS`, with waiting states returning to `IN_PROGRESS`, then `RESOLVED -> CLOSED`. Assignment and status history are append-only. SLA due times are derived from priority and environment configuration; overdue is a derived read concern, not a mutable flag.

Assignment is serialized on the ticket row. Repeating the same assignee is idempotent and creates no additional assignment/history record. Committed assignment and internal-note changes write their audit event through the same Prisma transaction; audit metadata stores identifiers, never message bodies.

Customer related-entity validation is ownership-bound for orders, payments, refund requests, return requests, and warranty claims. Platform lifecycle transitions and priority escalations also append their audit evidence in the transaction that commits the ticket mutation.

## Supplier workspace visibility

Supplier ticket reads are organization-scoped and return PUBLIC messages only.
Supplier ticket creation requires an initial public message; the ticket and
message are created together in the same Prisma write.
Supplier replies require `support.reply`; closed tickets reject replies. The Supplier
Workspace deliberately has no assignment, escalation, status, or internal-note
controls. See `supplier-business-management-ui.md` for UI details.

## Customer UI contract

Customer support is available at `/account/support`, `/account/support/new`, and
`/account/support/:ticketId`. Customer create requires a category, subject, and initial
public message; ticket and message are persisted together. Customer reads include only
public messages. Closed tickets reject customer replies, and no customer status mutation
route exists.

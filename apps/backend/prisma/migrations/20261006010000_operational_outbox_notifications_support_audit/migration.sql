CREATE TYPE "OperationalOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "NotificationStatus" AS ENUM ('AVAILABLE', 'FAILED');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('AVAILABLE', 'FAILED', 'NOT_CONFIGURED');
CREATE TYPE "SupportTicketOrigin" AS ENUM ('CUSTOMER', 'SUPPLIER');
CREATE TYPE "SupportCategory" AS ENUM ('ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'RETURN', 'WARRANTY', 'PRODUCT', 'ACCOUNT', 'SUPPLIER', 'OTHER');
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportMessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

CREATE TABLE "OperationalOutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "eventType" VARCHAR(120) NOT NULL, "aggregateType" VARCHAR(80) NOT NULL, "aggregateId" VARCHAR(120) NOT NULL,
  "organizationId" UUID, "userId" UUID, "dedupeKey" VARCHAR(240) NOT NULL, "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "OperationalOutboxStatus" NOT NULL DEFAULT 'PENDING', "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3), "claimedBy" VARCHAR(120), "processedAt" TIMESTAMP(3), "lastErrorCode" VARCHAR(120), "lastErrorMessage" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalOutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperationalOutboxEvent_dedupeKey_key" ON "OperationalOutboxEvent"("dedupeKey");
CREATE INDEX "OperationalOutboxEvent_status_availableAt_idx" ON "OperationalOutboxEvent"("status", "availableAt");
CREATE INDEX "OperationalOutboxEvent_eventType_createdAt_idx" ON "OperationalOutboxEvent"("eventType", "createdAt");

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "recipientUserId" UUID NOT NULL, "type" VARCHAR(120) NOT NULL, "category" VARCHAR(40) NOT NULL,
  "title" VARCHAR(240) NOT NULL, "body" VARCHAR(1000) NOT NULL, "entityType" VARCHAR(80), "entityId" VARCHAR(120),
  "status" "NotificationStatus" NOT NULL DEFAULT 'AVAILABLE', "mandatory" BOOLEAN NOT NULL DEFAULT false, "dedupeKey" VARCHAR(240) NOT NULL, "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"), CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");

CREATE TABLE "NotificationDeliveryAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "notificationId" UUID NOT NULL, "channel" "NotificationChannel" NOT NULL, "provider" VARCHAR(80),
  "status" "NotificationDeliveryStatus" NOT NULL, "attemptNumber" INTEGER NOT NULL, "providerMessageId" VARCHAR(200), "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "errorCode" VARCHAR(120), "errorMessage" VARCHAR(1000), CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDeliveryAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_notificationId_channel_attemptNumber_key" ON "NotificationDeliveryAttempt"("notificationId", "channel", "attemptNumber");
CREATE TABLE "NotificationPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "category" VARCHAR(40) NOT NULL, "inAppEnabled" BOOLEAN NOT NULL DEFAULT true, "emailEnabled" BOOLEAN NOT NULL DEFAULT false, "smsEnabled" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"), CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

CREATE TABLE "SupportTicket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticketNumber" VARCHAR(40) NOT NULL, "origin" "SupportTicketOrigin" NOT NULL, "requesterUserId" UUID NOT NULL, "customerProfileId" UUID, "organizationId" UUID, "supplierId" UUID, "category" "SupportCategory" NOT NULL, "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL', "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN', "subject" VARCHAR(240) NOT NULL, "relatedEntityType" VARCHAR(80), "relatedEntityId" VARCHAR(120), "assignedToUserId" UUID, "firstResponseDueAt" TIMESTAMP(3), "resolutionDueAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportTicket_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportTicket_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportTicket_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportTicket_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_origin_owner_check" CHECK (("origin" = 'CUSTOMER' AND "customerProfileId" IS NOT NULL AND "organizationId" IS NULL AND "supplierId" IS NULL) OR ("origin" = 'SUPPLIER' AND "customerProfileId" IS NULL AND "organizationId" IS NOT NULL AND "supplierId" IS NOT NULL))
);
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
CREATE INDEX "SupportTicket_status_priority_resolutionDueAt_idx" ON "SupportTicket"("status", "priority", "resolutionDueAt");
CREATE INDEX "SupportTicket_customerProfileId_createdAt_idx" ON "SupportTicket"("customerProfileId", "createdAt");
CREATE INDEX "SupportTicket_organizationId_createdAt_idx" ON "SupportTicket"("organizationId", "createdAt");
CREATE TABLE "SupportMessage" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticketId" UUID NOT NULL, "authorUserId" UUID NOT NULL, "visibility" "SupportMessageVisibility" NOT NULL, "body" VARCHAR(4000) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE TABLE "SupportTicketStatusHistory" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticketId" UUID NOT NULL, "previousStatus" "SupportTicketStatus", "newStatus" "SupportTicketStatus" NOT NULL, "actorUserId" UUID NOT NULL, "reason" VARCHAR(1000), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportTicketStatusHistory_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportTicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportTicketStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "SupportTicketStatusHistory_ticketId_createdAt_idx" ON "SupportTicketStatusHistory"("ticketId", "createdAt");
CREATE TABLE "SupportAssignmentHistory" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "ticketId" UUID NOT NULL, "previousAssigneeUserId" UUID, "newAssigneeUserId" UUID NOT NULL, "actorUserId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportAssignmentHistory_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportAssignmentHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "SupportAssignmentHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "SupportAssignmentHistory_ticketId_createdAt_idx" ON "SupportAssignmentHistory"("ticketId", "createdAt");

CREATE TABLE "AuditEvent" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "actorUserId" UUID, "actorType" VARCHAR(40) NOT NULL, "organizationId" UUID, "action" VARCHAR(120) NOT NULL, "entityType" VARCHAR(80) NOT NULL, "entityId" VARCHAR(120), "requestId" VARCHAR(120), "dedupeKey" VARCHAR(240), "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"), CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "AuditEvent_dedupeKey_key" ON "AuditEvent"("dedupeKey");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

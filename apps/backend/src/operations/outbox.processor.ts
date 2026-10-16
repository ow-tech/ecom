import { Injectable, Logger } from "@nestjs/common";
import { OperationalOutboxStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDeliveryService } from "../notifications/notification-delivery.service";

type Claimed = { id: string; eventType: string; payload: Prisma.JsonValue; attemptCount: number; claimedBy: string };
@Injectable()
export class OperationalOutboxProcessor {
  private readonly logger = new Logger(OperationalOutboxProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationDeliveryService) {}
  private positiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
  private maxAttempts() { return this.positiveInt(process.env.OUTBOX_MAX_ATTEMPTS, 8); }
  private leaseMs() { return this.positiveInt(process.env.OUTBOX_CLAIM_LEASE_SECONDS, 300) * 1000; }

  async processBatch(workerId = `operations-${randomUUID()}`, requestedSize?: number) {
    const maxAttempts = this.maxAttempts();
    const batchSize = Math.min(Math.max(requestedSize ?? this.positiveInt(process.env.OUTBOX_BATCH_SIZE, 25), 1), 100);
    const leaseThreshold = new Date(Date.now() - this.leaseMs());
    // An abandoned final attempt is terminal: it must not occupy PROCESSING forever.
    await this.prisma.operationalOutboxEvent.updateMany({
      where: {
        status: OperationalOutboxStatus.PROCESSING,
        OR: [{ claimedAt: { lte: leaseThreshold } }, { claimedAt: null }],
        attemptCount: { gte: maxAttempts },
      },
      data: { status: OperationalOutboxStatus.FAILED, claimedAt: null, claimedBy: null,
        lastErrorCode: "CLAIM_LEASE_EXPIRED", lastErrorMessage: "Worker lease expired after maximum attempts" },
    });
    // A crashed worker leaves PROCESSING. A stale lease is eligible for reclaim,
    // while FOR UPDATE SKIP LOCKED prevents competing processes from claiming it.
    const claimed = await this.prisma.$queryRaw<Claimed[]>(Prisma.sql`
      WITH picked AS (
        SELECT "id" FROM "OperationalOutboxEvent"
        WHERE "attemptCount" < ${maxAttempts}
          AND (("status" = 'PENDING' AND "availableAt" <= NOW())
            OR ("status" = 'PROCESSING' AND ("claimedAt" <= ${leaseThreshold} OR "claimedAt" IS NULL)))
        ORDER BY "availableAt", "createdAt", "id"
        FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      )
      UPDATE "OperationalOutboxEvent" e
      SET "status" = 'PROCESSING', "claimedAt" = NOW(), "claimedBy" = ${workerId},
          "attemptCount" = e."attemptCount" + 1, "updatedAt" = NOW()
      FROM picked WHERE e."id" = picked."id"
      RETURNING e."id", e."eventType", e."payload", e."attemptCount", e."claimedBy"
    `);
    for (const event of claimed) await this.processOne(event);
    return { claimed: claimed.length };
  }

  private async processOne(event: Claimed) {
    // A worker may finish after its lease was reclaimed. Its handler must be
    // idempotent; generation-fenced updates prevent stale workers writing status.
    const owner = { id: event.id, status: OperationalOutboxStatus.PROCESSING, claimedBy: event.claimedBy, attemptCount: event.attemptCount };
    try {
      await this.notifications.handleOutboxEvent(event.eventType, event.payload);
      await this.prisma.operationalOutboxEvent.updateMany({
        where: owner,
        data: { status: OperationalOutboxStatus.PROCESSED, processedAt: new Date(),
          claimedAt: null, claimedBy: null, lastErrorCode: null, lastErrorMessage: null },
      });
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Operational event handler failed").slice(0, 1000);
      const terminal = event.attemptCount >= this.maxAttempts();
      const delay = Math.min(60 * 60, 2 ** Math.min(event.attemptCount, 10));
      const changed = await this.prisma.operationalOutboxEvent.updateMany({
        where: owner,
        data: terminal
          ? { status: OperationalOutboxStatus.FAILED, lastErrorCode: "HANDLER_FAILED",
              lastErrorMessage: message, claimedAt: null, claimedBy: null }
          : { status: OperationalOutboxStatus.PENDING, availableAt: new Date(Date.now() + delay * 1000),
              lastErrorCode: "HANDLER_FAILED", lastErrorMessage: message, claimedAt: null, claimedBy: null },
      });
      if (changed.count) this.logger.warn(`outboxEventId=${event.id} processing failed: ${message}`);
    }
  }
}

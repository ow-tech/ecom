import { Injectable } from "@nestjs/common";
import { NotificationChannel, NotificationDeliveryStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationIntent, NotificationService } from "./notification.service";
import { BrevoMailService } from "./brevo-mail.service";
export type TransportResult = { provider: string; providerMessageId?: string };
export interface NotificationTransport { send(input: { notificationId: string; channel: NotificationChannel; recipientUserId: string; title: string; body: string }): Promise<TransportResult>; }
/** Test-only deterministic adapters; neither carries production credentials. */
export class FailingNotificationTransport implements NotificationTransport { constructor(private readonly code = "TEST_TRANSPORT_FAILED") {} async send(): Promise<TransportResult> { throw Object.assign(new Error("Deterministic notification transport failure"), { code: this.code }); } }
export class SuccessfulNotificationTransport implements NotificationTransport { constructor(private readonly provider = "test") {} async send(input: { notificationId: string }): Promise<TransportResult> { return { provider: this.provider, providerMessageId: `test-${input.notificationId}` }; } }
@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly notifications: NotificationService, private readonly prisma: PrismaService, private readonly brevo: BrevoMailService) {}
  async handleOutboxEvent(eventType: string, payload: Prisma.JsonValue) {
    const item = payload as unknown as NotificationIntent | { notifications?: NotificationIntent[] };
    const intents = "notifications" in item && Array.isArray(item.notifications) ? item.notifications : "recipientUserId" in item ? [item as NotificationIntent] : [];
    for (const intent of intents) await this.notifications.create({ ...intent, type: intent.type || eventType });
  }
  /**
   * External channels are deliberately attempted after the business/outbox
   * transaction. Each call creates a fresh immutable attempt row.
   */
  async deliverExternal(notificationId: string, channel: "EMAIL" | "SMS", transport?: NotificationTransport) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return null;
    const previous = await this.prisma.notificationDeliveryAttempt.aggregate({ where: { notificationId, channel }, _max: { attemptNumber: true } });
    const attemptNumber = (previous._max.attemptNumber ?? 0) + 1;
    const startedAt = new Date();
    if (!transport && channel === "EMAIL" && this.brevo.isConfigured()) {
      transport = { send: async input => {
        const user = await this.prisma.user.findUnique({ where: { id: input.recipientUserId }, select: { email: true } });
        if (!user) throw new Error("Notification recipient unavailable");
        const id = await this.brevo.send({ to: user.email, subject: input.title, text: input.body, category: "notification" });
        return { provider: "brevo", providerMessageId: id };
      } };
    }
    if (!transport) return this.prisma.notificationDeliveryAttempt.create({ data: { notificationId, channel, attemptNumber, status: NotificationDeliveryStatus.NOT_CONFIGURED, startedAt, completedAt: new Date(), errorCode: "PROVIDER_NOT_CONFIGURED", errorMessage: "No notification provider is configured" } });
    try {
      const result = await transport.send({ notificationId, channel, recipientUserId: notification.recipientUserId, title: notification.title, body: notification.body });
      return this.prisma.notificationDeliveryAttempt.create({ data: { notificationId, channel, provider: result.provider, attemptNumber, status: NotificationDeliveryStatus.SUCCEEDED, providerMessageId: result.providerMessageId, startedAt, completedAt: new Date() } });
    } catch (error) {
      const source = error as { code?: string; message?: string };
      return this.prisma.notificationDeliveryAttempt.create({ data: { notificationId, channel, attemptNumber, status: NotificationDeliveryStatus.FAILED, startedAt, completedAt: new Date(), errorCode: source.code ?? "TRANSPORT_FAILED", errorMessage: (source.message ?? "Notification transport failed").slice(0, 1000) } });
    }
  }
}

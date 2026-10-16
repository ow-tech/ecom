import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
const mandatory = new Set(["PAYMENT_CONFIRMED", "REFUND_COMPLETED", "SECURITY"]);
export type NotificationIntent = { recipientUserId: string; type: string; category: string; title: string; body: string; dedupeKey: string; entityType?: string; entityId?: string; mandatory?: boolean };
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}
  async create(intent: NotificationIntent) {
    // Users are normally retained by commerce ownership. If a retention/deletion
    // workflow has removed a recipient after an outbox intent committed, the
    // intent must not retry forever or turn into a raw foreign-key failure.
    if (!await this.prisma.user.findUnique({ where: { id: intent.recipientUserId }, select: { id: true } })) return null;
    const isMandatory = intent.mandatory ?? mandatory.has(intent.type);
    // In-app is the only configured delivery today.  Preferences govern optional
    // categories, while mandatory financial/security notices remain available.
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId_category: { userId: intent.recipientUserId, category: intent.category } } });
    if (!isMandatory && preference && !preference.inAppEnabled) return null;
    let row;
    try {
      row = await this.prisma.notification.upsert({ where: { dedupeKey: intent.dedupeKey }, update: {}, create: { ...intent, mandatory: isMandatory } });
    } catch (error) {
      // PostgreSQL can race two read-then-insert upserts.  The uniqueness
      // boundary is canonical; return its winner instead of leaking P2002.
      if ((error as { code?: string }).code !== "P2002") throw error;
      row = await this.prisma.notification.findUnique({ where: { dedupeKey: intent.dedupeKey } });
      if (!row) throw error;
    }
    await this.prisma.notificationDeliveryAttempt.upsert({ where: { notificationId_channel_attemptNumber: { notificationId: row.id, channel: NotificationChannel.IN_APP, attemptNumber: 1 } }, update: {}, create: { notificationId: row.id, channel: NotificationChannel.IN_APP, attemptNumber: 1, status: NotificationDeliveryStatus.AVAILABLE, completedAt: new Date() } });
    return row;
  }
  async list(userId: string, page = 1, limit = 50) { const where = { recipientUserId: userId }; const [items, total] = await this.prisma.$transaction([this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }), this.prisma.notification.count({ where })]); return { items, total, page, limit }; }
  unreadCount(userId: string) { return this.prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }); }
  async markRead(userId: string, id: string) { const changed = await this.prisma.notification.updateMany({ where: { id, recipientUserId: userId, readAt: null }, data: { readAt: new Date() } }); if (!changed.count && !await this.prisma.notification.findFirst({ where: { id, recipientUserId: userId } })) throw new NotFoundException("Notification not found"); return { id, read: true }; }
  async markAllRead(userId: string) { const changed = await this.prisma.notification.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } }); return { count: changed.count }; }
  preferences(userId: string) { return this.prisma.notificationPreference.findMany({ where: { userId }, orderBy: { category: "asc" } }); }
  async updatePreferences(userId: string, categories: Array<{ category: string; inAppEnabled?: boolean; emailEnabled?: boolean; smsEnabled?: boolean }>) { return Promise.all(categories.map((item) => this.prisma.notificationPreference.upsert({ where: { userId_category: { userId, category: item.category } }, update: { inAppEnabled: item.inAppEnabled, emailEnabled: item.emailEnabled, smsEnabled: item.smsEnabled }, create: { userId, category: item.category, inAppEnabled: item.inAppEnabled ?? true, emailEnabled: item.emailEnabled ?? false, smsEnabled: item.smsEnabled ?? false } }))); }
}

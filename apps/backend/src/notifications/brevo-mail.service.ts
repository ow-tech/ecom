import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type TransactionalMail = { to: string; subject: string; text: string; category?: string };

// Single provider adapter for all ECOM transactional emails. Never log request
// bodies or URLs: account recovery and invitation links are bearer capabilities.
// Provider acceptance is NOT mailbox delivery.
@Injectable()
export class BrevoMailService {
  constructor(private readonly config: ConfigService) {}
  isConfigured() {
    return Boolean(this.config.get<string>("BREVO_API_KEY") &&
      this.config.get<string>("BREVO_FROM_EMAIL"));
  }
  async send(input: TransactionalMail): Promise<string> {
    const key = this.config.get<string>("BREVO_API_KEY");
    const sender = this.config.get<string>("BREVO_FROM_EMAIL");
    const name = this.config.get<string>("BREVO_FROM_NAME") || "Ecom";
    if (!key || !sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))
      throw new ServiceUnavailableException("Transactional email is not configured");
    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: sender, name }, to: [{ email: input.to }],
          subject: input.subject, textContent: input.text,
          ...(input.category ? { tags: [input.category] } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new ServiceUnavailableException("Transactional email provider unavailable"); }
    if (!response.ok) throw new ServiceUnavailableException("Transactional email provider rejected the request");
    const result = await response.json().catch(() => ({})) as { messageId?: string };
    return result.messageId || "accepted";
  }
  async sendStaffInvitation(to: string, subject: string, invitationUrl: string): Promise<string> {
    let url: URL;
    try { url = new URL(invitationUrl); }
    catch { throw new ServiceUnavailableException("Invitation URL is invalid"); }
    if (url.protocol !== "https:" && !(this.config.get<string>("NODE_ENV") !== "production" && url.hostname === "localhost"))
      throw new ServiceUnavailableException("Invitation URL must use HTTPS");
    return this.send({ to, subject, category: "staff-invitation",
      text: `You have been invited to join Ecom staff. This link expires and can only be used once:\n\n${url.toString()}\n\nIf you did not expect this invitation, ignore this email.` });
  }
}

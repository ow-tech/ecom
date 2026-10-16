import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Never log provider request bodies: invitation URLs contain bearer capabilities.
// Dispatch success means Brevo accepted the request, not confirmed recipient delivery.
@Injectable()
export class BrevoMailService {
  constructor(private readonly config: ConfigService) {}

  async sendStaffInvitation(to: string, subject: string, invitationUrl: string): Promise<string> {
    const apiKey = this.config.get<string>("BREVO_API_KEY");
    const senderEmail = this.config.get<string>("STAFF_INVITATION_FROM_EMAIL");
    const senderName = this.config.get<string>("STAFF_INVITATION_FROM_NAME") || "Ecom";
    if (!apiKey || !senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
      throw new ServiceUnavailableException("Staff invitation email is not configured");
    }
    let url: URL;
    try { url = new URL(invitationUrl); } catch { throw new ServiceUnavailableException("Invitation URL is invalid"); }
    if (url.protocol !== "https:" && !(this.config.get<string>("NODE_ENV") !== "production" && url.hostname === "localhost"))
      throw new ServiceUnavailableException("Invitation URL must use HTTPS");

    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: to }],
          subject,
          textContent: `You have been invited to join Ecom staff. This link expires and can only be used once:\n\n${url.toString()}\n\nIf you did not expect this invitation, you can ignore it.`,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException("Invitation email provider unavailable");
    }
    if (!response.ok) throw new ServiceUnavailableException("Invitation email provider rejected the request");
    // Provider identifiers are diagnostic only and never used as authorization proof.
    const result = await response.json().catch(() => ({})) as { messageId?: string };
    return result.messageId || "accepted";
  }
}

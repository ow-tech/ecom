import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, SupplierPayoutType } from "@prisma/client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { AuditService } from "../audit/audit.service";
import { CreatePayoutDestinationDto } from "./dto/payout-destination.dto";

type Instructions = { iban?: string; accountNumber?: string; swiftBic?: string; mpesaPhone?: string };
type Destination = { id: string; supplierId: string; type: SupplierPayoutType; currencyCode: string; accountHolderName: string; bankName: string | null; bankCountryCode: string | null; maskedLastFour: string; isActive: boolean; createdAt: Date; updatedAt: Date };

@Injectable()
export class PayoutDestinationsService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  private key() {
    const raw = this.config.get<string>("PAYOUT_DETAILS_ENCRYPTION_KEY");
    // No accidental plaintext persistence if the deployment is not configured.
    if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) throw new ServiceUnavailableException("Payout instruction encryption is not configured");
    return Buffer.from(raw, "hex");
  }
  private seal(supplierId: string, details: Instructions) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), nonce);
    cipher.setAAD(Buffer.from(supplierId));
    const text = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
    return `v1:${nonce.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${text.toString("base64url")}`;
  }
  private open(supplierId: string, encrypted: string): Instructions {
    const [version, nonce, tag, content] = encrypted.split(":");
    if (version !== "v1" || !nonce || !tag || !content) throw new ServiceUnavailableException("Unsupported payout instruction encryption version");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(supplierId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(content, "base64url")), decipher.final()]).toString("utf8")) as Instructions;
  }
  private safe<T extends Destination>(row: T) {
    return {
      id: row.id, supplierId: row.supplierId, type: row.type, currencyCode: row.currencyCode,
      accountHolderName: row.accountHolderName, bankName: row.bankName,
      bankCountryCode: row.bankCountryCode, maskedLastFour: row.maskedLastFour,
      isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }
  private async supplierForOrganization(organizationId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { organizationId }, select: { id: true } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }
  private normalize(dto: CreatePayoutDestinationDto): { details: Instructions; mask: string; bankName: string | null; bankCountryCode: string | null } {
    if (dto.type === SupplierPayoutType.MPESA) {
      if (dto.currencyCode !== "KES") throw new BadRequestException("M-Pesa supplier payouts use KES");
      if (dto.iban || dto.accountNumber || dto.swiftBic || dto.bankName) throw new BadRequestException("Bank fields are invalid for M-Pesa");
      const value = (dto.mpesaPhone ?? "").replace(/[\s-]/g, "");
      if (!/^(?:\+254|0)[17]\d{8}$/.test(value)) throw new BadRequestException("Enter a valid Kenyan M-Pesa phone number");
      const phone = value.startsWith("0") ? `+254${value.slice(1)}` : value;
      return { details: { mpesaPhone: phone }, mask: phone.slice(-4), bankName: null, bankCountryCode: null };
    }
    if (dto.mpesaPhone) throw new BadRequestException("M-Pesa phone is invalid for bank transfer");
    const iban = (dto.iban ?? "").replace(/\s/g, "").toUpperCase();
    const accountNumber = (dto.accountNumber ?? "").trim();
    const bic = (dto.swiftBic ?? "").replace(/\s/g, "").toUpperCase();
    if (!dto.bankName?.trim() || !dto.bankCountryCode || (!iban && !accountNumber))
      throw new BadRequestException("Bank name, country, and IBAN or account number are required");
    if (!/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic))
      throw new BadRequestException("A valid SWIFT/BIC code is required");
    if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) throw new BadRequestException("IBAN format is invalid");
    if (accountNumber && !/^[A-Za-z0-9 /-]{3,60}$/.test(accountNumber)) throw new BadRequestException("Bank account number format is invalid");
    const number = iban || accountNumber;
    return { details: { ...(iban ? { iban } : {}), ...(accountNumber ? { accountNumber } : {}), swiftBic: bic }, mask: number.slice(-4), bankName: dto.bankName.trim(), bankCountryCode: dto.bankCountryCode };
  }

  async supplierList(actorId: string, organizationId: string) {
    await this.rbac.organizationContext(actorId, organizationId, "finance.read");
    const supplier = await this.supplierForOrganization(organizationId);
    return (await this.prisma.supplierPayoutDestination.findMany({ where: { supplierId: supplier.id }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] })).map(row => this.safe(row));
  }
  async supplierCreate(actorId: string, organizationId: string, dto: CreatePayoutDestinationDto) {
    await this.rbac.organizationContext(actorId, organizationId, "organization.members.manage");
    const supplier = await this.supplierForOrganization(organizationId);
    const normalized = this.normalize(dto);
    const row = await this.prisma.supplierPayoutDestination.create({ data: {
      supplierId: supplier.id, type: dto.type, currencyCode: dto.currencyCode,
      accountHolderName: dto.accountHolderName, bankName: normalized.bankName,
      bankCountryCode: normalized.bankCountryCode, maskedLastFour: normalized.mask,
      encryptedDetails: this.seal(supplier.id, normalized.details), createdByUserId: actorId,
    } });
    await this.audit.emit({ actorUserId: actorId, organizationId, action: "PAYOUT_DESTINATION_CREATED", entityType: "SUPPLIER_PAYOUT_DESTINATION", entityId: row.id, dedupeKey: `payout-destination:${row.id}:created`, metadata: { supplierId: supplier.id, type: row.type, currencyCode: row.currencyCode } });
    return this.safe(row);
  }
  async supplierDisable(actorId: string, organizationId: string, id: string) {
    await this.rbac.organizationContext(actorId, organizationId, "organization.members.manage");
    const supplier = await this.supplierForOrganization(organizationId);
    const row = await this.prisma.supplierPayoutDestination.updateMany({ where: { id, supplierId: supplier.id, isActive: true }, data: { isActive: false } });
    if (!row.count && !await this.prisma.supplierPayoutDestination.findFirst({ where: { id, supplierId: supplier.id } })) throw new NotFoundException("Payout destination not found");
    await this.audit.emit({ actorUserId: actorId, organizationId, action: "PAYOUT_DESTINATION_DISABLED", entityType: "SUPPLIER_PAYOUT_DESTINATION", entityId: id, dedupeKey: `payout-destination:${id}:disabled`, metadata: { supplierId: supplier.id } });
    return { id, isActive: false };
  }
  async platformList(actorId: string, supplierId: string) {
    await this.rbac.requirePlatform(actorId, "platform.finance.read");
    return (await this.prisma.supplierPayoutDestination.findMany({ where: { supplierId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] })).map(row => this.safe(row));
  }
  async platformReveal(actorId: string, supplierId: string, id: string) {
    await this.rbac.requirePlatform(actorId, "platform.settlements.manage");
    const row = await this.prisma.supplierPayoutDestination.findFirst({ where: { id, supplierId } });
    if (!row) throw new NotFoundException("Payout destination not found");
    const details = this.open(supplierId, row.encryptedDetails);
    await this.audit.emit({ actorUserId: actorId, action: "PAYOUT_DESTINATION_REVEALED", entityType: "SUPPLIER_PAYOUT_DESTINATION", entityId: row.id, metadata: { supplierId: row.supplierId, type: row.type, currencyCode: row.currencyCode } });
    return { ...this.safe(row), ...details };
  }
  async assertSelectable(tx: Prisma.TransactionClient, supplierId: string, currencyCode: string, destinationId: string) {
    const destination = await tx.supplierPayoutDestination.findFirst({ where: { id: destinationId, supplierId, currencyCode, isActive: true } });
    if (!destination) throw new BadRequestException("Selected payout destination is inactive, missing or currency-incompatible");
    return destination;
  }
}

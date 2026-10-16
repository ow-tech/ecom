import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountAudience, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerAddressDto, UpdateCustomerAddressDto, UpdateCustomerProfileDto } from "./dto/customer.dto";

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // Canonical lazy customer-commerce identity seam.
  async ensureCustomerProfile(userId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountAudience: true } });
    if (owner?.accountAudience !== AccountAudience.CUSTOMER) throw new ForbiddenException("Customer account required");
    const existing = await this.prisma.customerProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    try { return await this.prisma.customerProfile.create({ data: { userId } }); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return this.prisma.customerProfile.findUniqueOrThrow({ where: { userId } });
    }
  }

  async getProfile(userId: string) { return this.ensureCustomerProfile(userId); }

  async updateProfile(userId: string, dto: UpdateCustomerProfileDto) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.customerProfile.update({ where: { id: profile.id }, data: dto });
  }

  async listAddresses(userId: string) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.customerAddress.findMany({ where: { customerProfileId: profile.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  }

  async getAddress(userId: string, addressId: string) {
    const profile = await this.ensureCustomerProfile(userId);
    const address = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerProfileId: profile.id } });
    if (!address) throw new NotFoundException("Address not found");
    return address;
  }

  async createAddress(userId: string, dto: CreateCustomerAddressDto) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id}::uuid FOR UPDATE`);
      const addressCount = await tx.customerAddress.count({ where: { customerProfileId: profile.id } });
      const isDefault = dto.isDefault === true || addressCount === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerProfileId: profile.id, isDefault: true }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...dto, isDefault, customerProfileId: profile.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateCustomerAddressDto) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id}::uuid FOR UPDATE`);
      const address = await tx.customerAddress.findFirst({ where: { id: addressId, customerProfileId: profile.id } });
      if (!address) throw new NotFoundException("Address not found");
      if (address.isDefault && dto.isDefault === false) throw new BadRequestException("Set another address as default before unsetting this address");
      if (dto.isDefault) await tx.customerAddress.updateMany({ where: { customerProfileId: profile.id, isDefault: true, id: { not: address.id } }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id: address.id }, data: dto });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id}::uuid FOR UPDATE`);
      const address = await tx.customerAddress.findFirst({ where: { id: addressId, customerProfileId: profile.id } });
      if (!address) throw new NotFoundException("Address not found");
      if (!address.isDefault) {
        await tx.customerAddress.updateMany({ where: { customerProfileId: profile.id, isDefault: true }, data: { isDefault: false } });
        return tx.customerAddress.update({ where: { id: address.id }, data: { isDefault: true } });
      }
      return address;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteAddress(userId: string, addressId: string) {
    const profile = await this.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CustomerProfile" WHERE "id" = ${profile.id}::uuid FOR UPDATE`);
      const address = await tx.customerAddress.findFirst({ where: { id: addressId, customerProfileId: profile.id } });
      if (!address) throw new NotFoundException("Address not found");
      await tx.customerAddress.delete({ where: { id: address.id } });
      let defaultAddressId: string | null = null;
      if (address.isDefault) {
        const replacement = await tx.customerAddress.findFirst({ where: { customerProfileId: profile.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (replacement) {
          await tx.customerAddress.update({ where: { id: replacement.id }, data: { isDefault: true } });
          defaultAddressId = replacement.id;
        }
      }
      return { deleted: true, defaultAddressId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

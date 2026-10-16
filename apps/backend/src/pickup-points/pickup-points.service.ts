import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PickupPointStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CreatePickupPointDto, UpdatePickupPointDto } from "./dto/pickup-point.dto";

@Injectable()
export class PickupPointsService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}
  private output<T extends { pickupFee: Prisma.Decimal }>(row: T) { return { ...row, pickupFee: row.pickupFee.toFixed(2) }; }
  async publicList(countryCode?: string, region?: string, city?: string) {
    const rows = await this.prisma.pickupPoint.findMany({ where: { status: PickupPointStatus.ACTIVE, ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}), ...(region ? { region: { equals: region.trim(), mode: "insensitive" } } : {}), ...(city ? { city: { equals: city.trim(), mode: "insensitive" } } : {}) }, orderBy: [{ city: "asc" }, { name: "asc" }] });
    return rows.map((row) => this.output(row));
  }
  async list(userId: string) { await this.rbac.requirePlatform(userId, "platform.pickup_points.read"); return (await this.prisma.pickupPoint.findMany({ orderBy: { createdAt: "asc" } })).map((row) => this.output(row)); }
  async get(userId: string, id: string) { await this.rbac.requirePlatform(userId, "platform.pickup_points.read"); const row = await this.prisma.pickupPoint.findUnique({ where: { id } }); if (!row) throw new NotFoundException("Pickup point not found"); return this.output(row); }
  async create(userId: string, dto: CreatePickupPointDto) { await this.rbac.requirePlatform(userId, "platform.pickup_points.manage"); try { return this.output(await this.prisma.pickupPoint.create({ data: { ...dto, openingHours: dto.openingHours as Prisma.InputJsonValue | undefined, pickupFee: new Prisma.Decimal(dto.pickupFee) } })); } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Pickup point code or slug already exists"); throw error; } }
  async update(userId: string, id: string, dto: UpdatePickupPointDto) { await this.rbac.requirePlatform(userId, "platform.pickup_points.manage"); const exists = await this.prisma.pickupPoint.findUnique({ where: { id } }); if (!exists) throw new NotFoundException("Pickup point not found"); return this.output(await this.prisma.pickupPoint.update({ where: { id }, data: { ...dto, openingHours: dto.openingHours as Prisma.InputJsonValue | undefined, pickupFee: dto.pickupFee === undefined ? undefined : new Prisma.Decimal(dto.pickupFee) } })); }
}

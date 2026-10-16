import { Injectable } from "@nestjs/common";
import { DeliveryRateStatus, DeliveryZoneStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
type Address = { countryCode: string; region: string; city: string };
@Injectable()
export class DeliveryZoneResolver {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(address: Address, currencyCode: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const normalized = (value: string) => value.trim().toLowerCase();
    const zones = await client.deliveryZone.findMany({ where: { countryCode: address.countryCode.toUpperCase(), status: DeliveryZoneStatus.ACTIVE }, include: { rates: { where: { status: DeliveryRateStatus.ACTIVE, currencyCode }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const matches = zones.filter((zone) => (!zone.region || normalized(zone.region) === normalized(address.region)) && (!zone.city || normalized(zone.city) === normalized(address.city)) && zone.rates.length > 0);
    matches.sort((a, b) => Number(Boolean(b.city)) - Number(Boolean(a.city)) || Number(Boolean(b.region)) - Number(Boolean(a.region)) || a.id.localeCompare(b.id));
    const zone = matches[0];
    return zone ? { zone, rate: zone.rates[0] } : null;
  }
}

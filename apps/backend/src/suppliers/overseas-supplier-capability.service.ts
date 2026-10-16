import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountAudience, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class OverseasSupplierCapabilityService {
 constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
 async set(actorId: string, supplierId: string, enabled: boolean) {
  return this.prisma.$transaction(async tx => {
   await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${actorId}::uuid FOR UPDATE`);
   const actor=await tx.user.findUnique({where:{id:actorId},select:{accountAudience:true,status:true}});
   if(actor?.accountAudience!==AccountAudience.WORKFORCE || actor.status!=="ACTIVE") throw new ForbiddenException("Super admin required");
   const root=await tx.platformRoleAssignment.findFirst({where:{userId:actorId,role:{key:"platform.super_admin",scope:"PLATFORM"}}});
   if(!root) throw new ForbiddenException("Only the super admin may enable overseas shipping");
   await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Supplier" WHERE "id"=${supplierId}::uuid FOR UPDATE`);
   const supplier=await tx.supplier.findUnique({where:{id:supplierId}});
   if(!supplier) throw new NotFoundException("Supplier not found");
   if(!enabled){
    // Existing OVERSEAS listings stay identifiable but cannot accept new checkouts.
    // Keep historical order-item origin/ETA snapshots unchanged.
    await tx.supplierListing.updateMany({where:{supplierId,origin:"OVERSEAS",status:"ACTIVE"},data:{status:"INACTIVE"}});
   }
   if(supplier.overseasEnabled!==enabled){
    await tx.supplier.update({where:{id:supplierId},data:{overseasEnabled:enabled}});
    await this.audit.emitInTransaction(tx,{actorUserId:actorId,action:enabled?"OVERSEAS_SHIPPING_ENABLED":"OVERSEAS_SHIPPING_DISABLED",entityType:"SUPPLIER",entityId:supplierId,metadata:{enabled}});
   }
   return {supplierId,overseasEnabled:enabled};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
}

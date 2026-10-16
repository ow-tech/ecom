import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PublicCatalogueController } from "./public-catalogue.controller";
import { PublicCatalogueService } from "./public-catalogue.service";

@Module({ imports: [PrismaModule], controllers: [PublicCatalogueController], providers: [PublicCatalogueService] })
export class PublicCatalogueModule {}

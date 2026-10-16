import { Controller, Get, Param, Query } from "@nestjs/common";
import { PublicCatalogueListDto, PublicCatalogueProductListDto } from "./dto/public-catalogue.dto";
import { PublicCatalogueService } from "./public-catalogue.service";

@Controller("catalogue")
export class PublicCatalogueController {
  constructor(private readonly catalogue: PublicCatalogueService) {}

  @Get("categories") categories() { return this.catalogue.categories(); }
  @Get("categories/:slug") category(@Param("slug") slug: string) { return this.catalogue.category(slug); }
  @Get("products") products(@Query() query: PublicCatalogueProductListDto) { return this.catalogue.products(query); }
  @Get("products/:slug") product(@Param("slug") slug: string) { return this.catalogue.product(slug); }
  @Get("listings") list(@Query() query: PublicCatalogueListDto) { return this.catalogue.list(query); }
  @Get("listings/:listingId") get(@Param("listingId") listingId: string) { return this.catalogue.get(listingId); }
}

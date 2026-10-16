import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CustomerService } from "./customer.service";
import { CreateCustomerAddressDto, UpdateCustomerAddressDto, UpdateCustomerProfileDto } from "./dto/customer.dto";

@UseGuards(SessionAuthGuard)
@Controller("customer")
export class CustomerController {
  constructor(private readonly customer: CustomerService) {}
  @Get("profile") profile(@CurrentUser() user: AuthenticatedUser) { return this.customer.getProfile(user.id); }
  @Patch("profile") updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCustomerProfileDto) { return this.customer.updateProfile(user.id, dto); }
  @Get("addresses") addresses(@CurrentUser() user: AuthenticatedUser) { return this.customer.listAddresses(user.id); }
  @Post("addresses") createAddress(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerAddressDto) { return this.customer.createAddress(user.id, dto); }
  @Get("addresses/:addressId") address(@CurrentUser() user: AuthenticatedUser, @Param("addressId") id: string) { return this.customer.getAddress(user.id, id); }
  @Patch("addresses/:addressId") updateAddress(@CurrentUser() user: AuthenticatedUser, @Param("addressId") id: string, @Body() dto: UpdateCustomerAddressDto) { return this.customer.updateAddress(user.id, id, dto); }
  @Post("addresses/:addressId/default") setDefaultAddress(@CurrentUser() user: AuthenticatedUser, @Param("addressId") id: string) { return this.customer.setDefaultAddress(user.id, id); }
  @Delete("addresses/:addressId") deleteAddress(@CurrentUser() user: AuthenticatedUser, @Param("addressId") id: string) { return this.customer.deleteAddress(user.id, id); }
}

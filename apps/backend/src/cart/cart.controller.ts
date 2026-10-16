import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CartService } from "./cart.service";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto";

@UseGuards(SessionAuthGuard)
@Controller("customer/cart")
export class CartController {
  constructor(private readonly cart: CartService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) { return this.cart.get(user.id); }
  @Post("items") add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) { return this.cart.add(user.id, dto); }
  @Patch("items/:cartItemId") update(@CurrentUser() user: AuthenticatedUser, @Param("cartItemId") id: string, @Body() dto: UpdateCartItemDto) { return this.cart.update(user.id, id, dto); }
  @Delete("items/:cartItemId") remove(@CurrentUser() user: AuthenticatedUser, @Param("cartItemId") id: string) { return this.cart.remove(user.id, id); }
  @Post("clear") clear(@CurrentUser() user: AuthenticatedUser) { return this.cart.clear(user.id); }
}

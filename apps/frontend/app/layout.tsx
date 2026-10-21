import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { SessionProvider } from "../components/session-provider";
import { CartProvider } from "../components/cart-provider";
import { CustomerNavigation } from "../components/customer-navigation";

export const metadata: Metadata = {
  title: "Ecom Platform",
  description: "Multi-tenant commerce and sourcing platform",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><SessionProvider><CartProvider><CustomerNavigation />{children}</CartProvider></SessionProvider></body>
    </html>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogueBrowser } from "../../components/catalogue-browser";

export const metadata: Metadata = { title: "Products | Ecom", description: "Browse products with live offers from active sellers." };

export default function ProductsPage() { return <><main><Suspense><CatalogueBrowser /></Suspense></main></>; }

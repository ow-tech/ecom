import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogueBrowser } from "../../../components/catalogue-browser";
import { StorefrontHeader } from "../../../components/storefront-header";

export const metadata: Metadata = { title: "Category | Ecom", description: "Browse products in this Ecom category." };

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <><StorefrontHeader /><main><Suspense><CatalogueBrowser category={slug} /></Suspense></main></>; }

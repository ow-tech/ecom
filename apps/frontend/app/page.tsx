import { StorefrontHeader } from "../components/storefront-header";
import { CatalogueBrowser } from "../components/catalogue-browser";
import { Suspense } from "react";

export default function HomePage() { return <><StorefrontHeader /><main><Suspense><CatalogueBrowser /></Suspense></main></>; }

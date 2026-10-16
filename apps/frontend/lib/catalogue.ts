import { api, type CatalogueCategory, type CatalogueProductDetail, type CatalogueProductPage } from "./api";

export type CatalogueQuery = { category?: string; search?: string; supplier?: string; currency?: string; minPrice?: string; maxPrice?: string; sort?: string; page?: number; limit?: number };

export const catalogue = {
  getCategories: (): Promise<CatalogueCategory[]> => api.catalogueCategories(),
  getCategory: (slug: string): Promise<CatalogueCategory> => api.catalogueCategory(slug),
  getProducts: (query: CatalogueQuery = {}, signal?: AbortSignal): Promise<CatalogueProductPage> => api.catalogueProducts(query, signal ? { signal } : undefined),
  getProduct: (slug: string): Promise<CatalogueProductDetail> => api.catalogueProduct(slug),
};

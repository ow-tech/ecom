"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, Button, Card, FormField, Input, SectionHeader, Select, Skeleton, Textarea } from "./ui";

type Row = { id: string; name?: string; categoryId?: string; status?: string; [key: string]: any };
export function PlatformCatalogueEdit({ mode, permissions }: { mode: "categories" | "products"; permissions: string[] }) {
  const allowed = permissions.includes(mode === "categories" ? "platform.categories.manage" : "platform.products.manage");
  const [categories, setCategories] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [selectedMedia, setSelectedMedia] = useState("");
  const [variants, setVariants] = useState<Row[]>([]);
  const [media, setMedia] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(allowed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setError(undefined);
    try {
      const [categoriesResult, productsResult] = await Promise.all([
        api.platformCategories(),
        mode === "products" ? api.platformProducts({ search }) : Promise.resolve({ data: [] }),
      ]);
      setCategories(categoriesResult);
      setProducts(productsResult.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load catalogue editing."); }
    finally { setLoading(false); }
  }, [allowed, mode, search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (mode !== "products" || !selectedId || !allowed) { setVariants([]); setMedia([]); return; }
    let active = true;
    void Promise.all([api.platformVariants(selectedId), api.platformMedia(selectedId)]).then(([v, m]) => {
      if (active) { setVariants(v); setMedia(m); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load variants or media."); });
    return () => { active = false; };
  }, [selectedId, mode, allowed]);
  async function save(event: FormEvent<HTMLFormElement>, type: "category" | "product" | "variant" | "media") {
    event.preventDefault();
    if (!allowed || busy || !selectedId) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      if (type === "category") {
        await api.updatePlatformCategory(selectedId, { name: input.name, description: input.description, status: input.status });
      } else if (type === "product") {
        await api.updatePlatformProduct(selectedId, { name: input.name, categoryId: input.categoryId, brand: input.brand, description: input.description, status: input.status });
      } else if (type === "variant") {
        if (!selectedVariant) return;
        const attributes = JSON.parse(String(input.attributes || "{}"));
        await api.updatePlatformVariant(selectedId, selectedVariant, { name: input.name, sku: input.sku, attributes, status: input.status });
      } else {
        if (!selectedMedia) return;
        await api.updatePlatformMedia(selectedId, selectedMedia, { storageKey: input.storageKey, url: input.url || undefined, altText: input.altText, sortOrder: Number(input.sortOrder || 0) });
      }
      await load();
      if (mode === "products") {
        const [v, m] = await Promise.all([api.platformVariants(selectedId), api.platformMedia(selectedId)]);
        setVariants(v); setMedia(m);
      }
      setNotice("Catalogue changes saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save catalogue changes."); }
    finally { setBusy(false); }
  }
  if (!allowed) return null;
  const options = mode === "categories" ? categories : products;
  const current = options.find(v => v.id === selectedId);
  const variant = variants.find(v => v.id === selectedVariant);
  const asset = media.find(v => v.id === selectedMedia);
  return <Card className="mt-6">
    <SectionHeader title={mode === "categories" ? "Edit category" : "Edit existing product"} description="Update platform-owned catalogue identity only. Supplier prices, stock and offers are independent." />
    {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
    {notice && <div className="mt-4"><Alert tone="success">{notice}</Alert></div>}
    {mode === "products" && <form className="mt-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(query); }}>
      <Input aria-label="Find product to edit" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products"/>
      <Button type="submit" variant="outline">Search products</Button>
    </form>}
    {loading ? <Skeleton className="mt-4 h-32" /> : <>
      <div className="mt-4">
        <label htmlFor="catalogue-edit-choice" className="mb-2 block text-sm font-semibold">{mode === "categories" ? "Category to edit" : "Product to edit"}</label>
        <Select id="catalogue-edit-choice" value={selectedId} onChange={e => { setSelectedId(e.target.value); setSelectedVariant(""); setSelectedMedia(""); }}>
          <option value="">Select {mode === "categories" ? "category" : "product"}</option>
          {options.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </Select>
      </div>
      {current && <form key={current.id} className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={event => void save(event, mode === "categories" ? "category" : "product")}>
        <FormField label="Catalogue name"><Input name="name" defaultValue={current.name} maxLength={200} required/></FormField>
        <FormField label="Catalogue status"><Select name="status" defaultValue={current.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>{mode === "products" && <option value="DRAFT">Draft</option>}</Select></FormField>
        {mode === "products" && <>
          <FormField label="Product category"><Select name="categoryId" defaultValue={current.categoryId} required>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</Select></FormField>
          <FormField label="Brand"><Input name="brand" defaultValue={current.brand ?? ""} maxLength={120}/></FormField>
        </>}
        <div className="sm:col-span-2"><FormField label="Catalogue description"><Textarea name="description" defaultValue={current.description ?? ""} maxLength={5000}/></FormField></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save {mode === "categories" ? "category" : "product"}</Button></div>
      </form>}
      {mode === "products" && current && <>
        <div className="mt-7 border-t border-border pt-5">
          <label htmlFor="variant-edit-choice" className="mb-2 block text-sm font-semibold">Variant to edit</label>
          <Select id="variant-edit-choice" value={selectedVariant} onChange={e => setSelectedVariant(e.target.value)}><option value="">Select variant</option>{variants.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
          {variant && <form className="mt-4 grid gap-3 sm:grid-cols-2" key={variant.id} onSubmit={event => void save(event, "variant")}>
            <FormField label="Variant name"><Input name="name" defaultValue={variant.name} required/></FormField>
            <FormField label="Variant SKU"><Input name="sku" defaultValue={variant.sku ?? ""}/></FormField>
            <FormField label="Variant status"><Select name="status" defaultValue={variant.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
            <FormField label="Variant attributes JSON"><Textarea name="attributes" defaultValue={JSON.stringify(variant.attributes ?? {})} required/></FormField>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save variant</Button></div>
          </form>}
        </div>
        <div className="mt-7 border-t border-border pt-5">
          <label htmlFor="media-edit-choice" className="mb-2 block text-sm font-semibold">Media metadata to edit</label>
          <Select id="media-edit-choice" value={selectedMedia} onChange={e => setSelectedMedia(e.target.value)}><option value="">Select media</option>{media.map(item => <option value={item.id} key={item.id}>{item.altText || item.storageKey}</option>)}</Select>
          {asset && <form className="mt-4 grid gap-3 sm:grid-cols-2" key={asset.id} onSubmit={event => void save(event, "media")}>
            <FormField label="Media storage key"><Input name="storageKey" defaultValue={asset.storageKey} required/></FormField>
            <FormField label="Media delivery URL"><Input name="url" type="url" defaultValue={asset.url ?? ""}/></FormField>
            <FormField label="Media alt text"><Input name="altText" defaultValue={asset.altText ?? ""}/></FormField>
            <FormField label="Media order"><Input name="sortOrder" type="number" step={1} defaultValue={asset.sortOrder ?? 0}/></FormField>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save media metadata</Button></div>
          </form>}
        </div>
      </>}
    </>}
  </Card>;
}

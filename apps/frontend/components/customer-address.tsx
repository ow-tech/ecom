"use client";

import { useState, type FormEvent } from "react";
import { api, type AddressInput, type CustomerAddress } from "../lib/api";
import { Alert, Button, FormField, Input, Textarea } from "./ui";

function optional(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

export function addressLines(address: CustomerAddress) {
  return [
    [address.building, address.houseNumber].filter(Boolean).join(" "),
    address.street,
    address.estate,
    [address.city, address.region].filter(Boolean).join(", "),
    address.countryCode,
  ].filter(Boolean);
}

export function CustomerAddressForm({ initial, onSaved, onCancel, compact = false }: {
  initial?: CustomerAddress;
  onSaved: (address: CustomerAddress) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: AddressInput = {
      recipientName: String(form.get("recipientName") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      countryCode: String(form.get("countryCode") ?? "").trim().toUpperCase(),
      region: String(form.get("region") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      label: optional(form, "label"),
      alternativePhone: optional(form, "alternativePhone"),
      estate: optional(form, "estate"),
      street: optional(form, "street"),
      building: optional(form, "building"),
      houseNumber: optional(form, "houseNumber"),
      landmark: optional(form, "landmark"),
      deliveryNotes: optional(form, "deliveryNotes"),
      ...(!initial && form.get("isDefault") ? { isDefault: true } : {}),
    };
    setSaving(true);
    setError(undefined);
    try {
      const saved = initial ? await api.updateCustomerAddress(initial.id, input) : await api.createCustomerAddress(input);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not save this address.");
    } finally {
      setSaving(false);
    }
  };
  return <form className={compact ? "space-y-4" : "space-y-5"} onSubmit={submit}>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Address label" hint="For example: Home or Office"><Input name="label" defaultValue={initial?.label ?? ""} maxLength={80} autoComplete="off" /></FormField>
      <FormField label="Recipient name"><Input name="recipientName" defaultValue={initial?.recipientName ?? ""} maxLength={200} autoComplete="name" required /></FormField>
      <FormField label="Phone number"><Input name="phone" defaultValue={initial?.phone ?? ""} maxLength={40} autoComplete="tel" required /></FormField>
      <FormField label="Alternative phone"><Input name="alternativePhone" defaultValue={initial?.alternativePhone ?? ""} maxLength={40} autoComplete="tel" /></FormField>
      <FormField label="Country code" hint="Two-letter code, for example KE"><Input name="countryCode" defaultValue={initial?.countryCode ?? "KE"} minLength={2} maxLength={2} autoCapitalize="characters" required /></FormField>
      <FormField label="County / region"><Input name="region" defaultValue={initial?.region ?? ""} maxLength={120} autoComplete="address-level1" required /></FormField>
      <FormField label="City / town"><Input name="city" defaultValue={initial?.city ?? ""} maxLength={120} autoComplete="address-level2" required /></FormField>
      <FormField label="Estate / neighbourhood"><Input name="estate" defaultValue={initial?.estate ?? ""} maxLength={160} autoComplete="address-level3" /></FormField>
      <FormField label="Street"><Input name="street" defaultValue={initial?.street ?? ""} maxLength={200} autoComplete="street-address" /></FormField>
      <FormField label="Building"><Input name="building" defaultValue={initial?.building ?? ""} maxLength={160} /></FormField>
      <FormField label="House / unit number"><Input name="houseNumber" defaultValue={initial?.houseNumber ?? ""} maxLength={80} /></FormField>
      <FormField label="Landmark"><Input name="landmark" defaultValue={initial?.landmark ?? ""} maxLength={240} /></FormField>
    </div>
    <FormField label="Delivery instructions" hint="Share access, reception, or drop-off guidance. Do not include payment details."><Textarea name="deliveryNotes" defaultValue={initial?.deliveryNotes ?? ""} maxLength={1000} /></FormField>
    {!initial && <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="h-4 w-4 accent-primary" type="checkbox" name="isDefault" />Use as my default delivery address</label>}
    <div className="flex flex-wrap gap-3"><Button type="submit" loading={saving}>{initial ? "Save changes" : "Save address"}</Button>{onCancel && <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>}</div>
  </form>;
}

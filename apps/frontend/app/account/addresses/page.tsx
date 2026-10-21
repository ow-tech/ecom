"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CustomerAddressForm, addressLines } from "../../../components/customer-address";
import { useSession } from "../../../components/session-provider";
import { Alert, Button, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, StorefrontContainer, Surface } from "../../../components/ui";
import { api, type CustomerAddress } from "../../../lib/api";
import { loginHref } from "../../../lib/auth-routing";

function ordered(addresses: CustomerAddress[]) {
  return [...addresses].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
}

export default function AddressesPage() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const [addresses, setAddresses] = useState<CustomerAddress[]>();
  const [loadError, setLoadError] = useState<string>();
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" }>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [workingId, setWorkingId] = useState<string>();
  const load = useCallback(async () => {
    setLoadError(undefined);
    try { setAddresses(ordered(await api.customerAddresses())); }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : "We could not load your addresses."); }
  }, []);
  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref("/account/addresses")); }, [router, session, sessionLoading]);
  useEffect(() => { if (session) void load(); }, [load, session]);
  const save = (address: CustomerAddress, message: string) => {
    setAddresses(current => ordered([...(current ?? []).filter(value => value.id !== address.id), address]));
    setAdding(false); setEditing(undefined); setNotice({ message, tone: "success" });
  };
  const makeDefault = async (address: CustomerAddress) => {
    setWorkingId(address.id); setNotice(undefined);
    try { await api.setDefaultCustomerAddress(address.id); await load(); setNotice({ message: `${address.label || address.recipientName} is now your default address.`, tone: "success" }); }
    catch (cause) { setNotice({ message: cause instanceof Error ? cause.message : "We could not change your default address.", tone: "error" }); }
    finally { setWorkingId(undefined); }
  };
  const remove = async (address: CustomerAddress) => {
    if (!window.confirm(`Delete ${address.label || address.recipientName}? Existing orders will keep their delivery snapshot.`)) return;
    setWorkingId(address.id); setNotice(undefined);
    try { await api.deleteCustomerAddress(address.id); await load(); setNotice({ message: "Address deleted. Existing orders were not changed.", tone: "success" }); }
    catch (cause) { setNotice({ message: cause instanceof Error ? cause.message : "We could not delete this address.", tone: "error" }); }
    finally { setWorkingId(undefined); }
  };
  if (sessionLoading || !session) return <><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-64" /></StorefrontContainer></>;
  return <><StorefrontContainer className="max-w-5xl">
    <PageHeader eyebrow="Customer account" title="My addresses" description="Manage reusable delivery details. Orders keep the address captured when checkout was placed." actions={<div className="flex gap-2"><Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted" href="/account">Account</Link><Button onClick={() => { setAdding(true); setEditing(undefined); setNotice(undefined); }}>Add address</Button></div>} />
    {notice && <div className="mt-5"><Alert tone={notice.tone}>{notice.message}</Alert></div>}
    {adding && <Surface className="mt-7"><h2 className="mb-5 text-lg font-bold">Add delivery address</h2><CustomerAddressForm onSaved={address => save(address, "Address saved.")} onCancel={() => setAdding(false)} /></Surface>}
    {loadError ? <div className="mt-7"><ErrorState detail={loadError} retry={() => void load()} /></div> : !addresses ? <div className="mt-7"><Skeleton className="h-40" /></div> : !addresses.length && !adding ? <div className="mt-7"><EmptyState title="No saved addresses" detail="Add an address once, then select it during checkout." action={<Button onClick={() => setAdding(true)}>Add your first address</Button>} /></div> : <div className="mt-7 grid gap-4 md:grid-cols-2">{addresses.map(address => <Surface key={address.id} className={address.isDefault ? "border-primary ring-1 ring-primary" : ""}>
      {editing === address.id ? <><h2 className="mb-5 text-lg font-bold">Edit {address.label || "address"}</h2><CustomerAddressForm initial={address} onSaved={saved => save(saved, "Address updated. Checkout quotes will use the new details.")} onCancel={() => setEditing(undefined)} compact /></> : <>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{address.label || address.recipientName}</h2><p className="mt-1 text-sm text-foreground-muted">{address.recipientName} · {address.phone}</p></div>{address.isDefault && <StatusBadge tone="success">Default</StatusBadge>}</div>
        <p className="mt-4 text-sm leading-6">{addressLines(address).map(line => <span className="block" key={line}>{line}</span>)}</p>
        {address.alternativePhone && <p className="mt-3 text-sm text-foreground-muted">Alternative phone: {address.alternativePhone}</p>}
        {address.landmark && <p className="mt-2 text-sm text-foreground-muted">Landmark: {address.landmark}</p>}
        {address.deliveryNotes && <p className="mt-2 text-sm text-foreground-muted">Instructions: {address.deliveryNotes}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setEditing(address.id); setAdding(false); setNotice(undefined); }}>Edit</Button>{!address.isDefault && <Button variant="ghost" loading={workingId === address.id} onClick={() => void makeDefault(address)}>Set as default</Button>}<Button variant="ghost" disabled={workingId === address.id} onClick={() => void remove(address)}>Delete</Button></div>
      </>}
    </Surface>)}</div>}
  </StorefrontContainer></>;
}

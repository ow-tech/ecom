"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, type CommissionPolicySummary, type PlatformCommissionDefault } from "../lib/api";
import { Alert, Button, Card, FormField, Input, SectionHeader, Skeleton } from "./ui";

function percent(rate: string) { return (Number(rate) * 100).toFixed(4).replace(/\.?0+$/, ""); }
function toRate(input: string) {
  const raw = input.trim();
  if (!/^(?:[0-9]{1,3})(?:\.[0-9]{1,4})?$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 100 ? (n / 100).toFixed(6) : null;
}
export function PlatformCommissionManagement({ supplierId, canAdjust }: { supplierId: string; canAdjust: boolean }) {
  const [defaultData, setDefaultData] = useState<PlatformCommissionDefault>();
  const [supplierData, setSupplierData] = useState<CommissionPolicySummary>();
  const [defaultInput, setDefaultInput] = useState("10");
  const [overrideInput, setOverrideInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(undefined);
    try {
      const [defaultPolicy, supplierPolicy] = await Promise.all([
        api.platformDefaultCommission(),
        supplierId ? api.platformSupplierCommissionPolicy(supplierId) : Promise.resolve(undefined),
      ]);
      if (current !== sequence.current) return false;
      setDefaultData(defaultPolicy); setSupplierData(supplierPolicy);
      setDefaultInput(percent(defaultPolicy.current.rate));
      setOverrideInput(supplierPolicy?.source === "SUPPLIER" ? percent(supplierPolicy.rate) : "");
      return true;
    } catch (cause) {
      if (current === sequence.current) { setError(cause instanceof Error ? cause.message : "Unable to load commission policy."); setDefaultData(undefined); setSupplierData(undefined); }
      return false;
    } finally { if (current === sequence.current) setLoading(false); }
  }, [supplierId]);

  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);

  async function perform(action: () => Promise<unknown>) {
    if (busy || !canAdjust) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      await action();
      if (await reload()) setNotice("Commission policy updated. Existing earned commissions remain unchanged.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update commission policy."); }
    finally { setBusy(false); }
  }
  function saveDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const rate = toRate(defaultInput);
    if (!rate) { setError("Enter a percentage greater than zero and at most 100, with up to four decimal places."); return; }
    if (!window.confirm("Change the platform default commission for subsequent supplier earnings? Historical commissions will not change.")) return;
    void perform(() => api.setPlatformDefaultCommission(rate));
  }
  function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supplierId) return;
    const rate = toRate(overrideInput);
    if (!rate) { setError("Enter a percentage greater than zero and at most 100, with up to four decimal places."); return; }
    if (!window.confirm("Set this supplier's commission override for subsequent earnings?")) return;
    void perform(() => api.setPlatformSupplierCommission(supplierId, rate));
  }
  return <Card>
    <SectionHeader title="Marketplace commission policy" description="Each eligible sale earns the platform fee once. Supplier overrides take priority; otherwise the editable platform default applies." actions={<Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || busy}>Refresh rates</Button>} />
    {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
    {notice && <div className="mt-4"><Alert tone="success">{notice}</Alert></div>}
    {loading ? <Skeleton className="mt-5 h-24" /> : defaultData && <>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <p className="text-sm font-semibold">Platform default</p>
          <p className="mt-2 text-2xl font-bold">{percent(defaultData.current.rate)}%</p>
          <p className="text-xs text-foreground-muted">{defaultData.current.source === "ENV_DEFAULT" ? "Initial configured 10% fallback (until customized)" : "Platform-managed setting"}</p>
          {canAdjust && <form onSubmit={saveDefault} className="mt-4 space-y-3">
            <FormField label="New default commission (%)"><Input value={defaultInput} onChange={e => setDefaultInput(e.target.value)} inputMode="decimal" required /></FormField>
            <Button type="submit" disabled={busy}>Save platform default</Button>
          </form>}
        </section>
        <section>
          <p className="text-sm font-semibold">Selected supplier</p>
          {!supplierId ? <p className="mt-3 text-sm text-foreground-muted">Choose a supplier in the balances section to manage its rate.</p> :
           !supplierData ? <p className="mt-3 text-sm text-foreground-muted">Supplier commission unavailable.</p> : <>
            <p className="mt-2 text-2xl font-bold">{percent(supplierData.rate)}%</p>
            <p className="text-xs text-foreground-muted">{supplierData.source === "SUPPLIER" ? "Supplier-specific override" : "Inherits platform default"}</p>
            {canAdjust && <form onSubmit={saveOverride} className="mt-4 space-y-3">
              <FormField label="Supplier commission (%)"><Input value={overrideInput} onChange={e => setOverrideInput(e.target.value)} inputMode="decimal" required /></FormField>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>Set supplier rate</Button>
                {supplierData.source === "SUPPLIER" && <Button type="button" variant="outline" disabled={busy} onClick={() => {
                  if (window.confirm("End this supplier's active commission overrides and return to platform default?")) void perform(() => api.clearPlatformSupplierCommission(supplierId));
                }}>Use platform default</Button>}
              </div>
            </form>}
          </>}
        </section>
      </div>
      <p className="mt-5 text-xs text-foreground-muted">History: {defaultData.history.length} platform-rate change(s) recorded. Rate selection occurs at fulfilment; already recorded commission and payout values never change. No new fee is deducted when paying a supplier.</p>
    </>}
  </Card>;
}

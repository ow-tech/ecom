"use client";

import { useEffect, useState } from "react";
import { api, type CommissionPolicySummary } from "../lib/api";
import { Card, ErrorState, Skeleton } from "./ui";

export function SupplierCommissionOverview({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<CommissionPolicySummary>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setData(undefined); setError(undefined); setLoading(true);
    void api.supplierCommissionPolicy(organizationId).then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load commission details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId]);
  return <Card className="mt-6">
    <h2 className="text-lg font-bold">Your marketplace commission</h2>
    {loading ? <Skeleton className="mt-4 h-12"/> : error ? <ErrorState detail={error} /> : data && <>
      <p className="mt-3 text-2xl font-bold">{(Number(data.rate) * 100).toFixed(4).replace(/\.?0+$/, "")}%</p>
      <p className="mt-2 text-sm text-foreground-muted">{data.source === "SUPPLIER" ? "Your supplier-specific rate" : "Current platform default"} · Platform base rate {(Number(data.defaultRate) * 100).toFixed(4).replace(/\.?0+$/, "")}%</p>
      <p className="mt-2 text-xs text-foreground-muted">Applied to each eligible completed sale. Your available earnings and settlements already exclude this commission.</p>
    </>}
  </Card>;
}

"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, type OrganizationStaffList } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, PageHeader, Select, Skeleton, StatusBadge } from "./ui";

export function SupplierStaffManagement({ organizationId, permissions, actorUserId }: { organizationId: string; permissions: string[]; actorUserId: string }) {
  const canRead = permissions.includes("organization.members.read");
  const canManage = permissions.includes("organization.staff.manage");
  const [data, setData] = useState<OrganizationStaffList>();
  const [loading, setLoading] = useState(canRead);
  const [working, setWorking] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("organization.member");
  const [roleEdits, setRoleEdits] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true); setError(undefined);
    try { setData(await api.organizationStaff(organizationId)); }
    catch (cause) { setData(undefined); setError(cause instanceof Error ? cause.message : "Could not load staff."); }
    finally { setLoading(false); }
  }, [organizationId, canRead]);
  useEffect(() => { void load(); }, [load]);
  async function run(key: string, operation: () => Promise<unknown>, message: string) {
    if (working) return;
    setWorking(key); setError(undefined); setNotice(undefined);
    try { await operation(); await load(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Staff action failed."); }
    finally { setWorking(undefined); }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("invite", () => api.inviteOrganizationStaff(organizationId, { email: inviteEmail.trim(), roleKey: inviteRole }), "Invitation created. The recipient can accept it from their Ecom account.");
    // Do not wipe recipient input on failure; the operator may correct it.
  }
  if (!canRead) return <EmptyState title="Permission denied" detail="Your organization role cannot view staff records." />;
  return <><PageHeader eyebrow="Supplier workspace" title="Staff and permissions" description="Organization access is granted only after the invited Ecom account accepts its role."/>
    {error && <div className="mt-5"><ErrorState detail={error} retry={() => void load()}/></div>}
    {notice && <div className="mt-5"><Alert tone="success">{notice}</Alert></div>}
    {canManage && <Card className="mt-7"><h2 className="font-bold">Invite registered staff</h2><p className="mt-1 text-sm text-foreground-muted">Ask the person to register with Ecom first. Owner roles cannot be delegated.</p>
      <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <FormField label="Staff email"><Input type="email" autoComplete="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}/></FormField>
        <FormField label="Staff role"><Select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>{(data?.roles ?? []).map(role => <option value={role.key} key={role.key}>{role.name}</option>)}</Select></FormField>
        <Button type="submit" loading={working === "invite"} disabled={!data?.roles.length || Boolean(working)}>Send invitation</Button>
      </form>
    </Card>}
    {loading ? <Skeleton className="mt-7 h-48"/> : <Card className="mt-7"><h2 className="font-bold">Organization members</h2>
      {!data?.members.length ? <div className="mt-4"><EmptyState title="No staff found" detail="Invite registered team members to begin."/></div> :
      <div className="mt-4 space-y-3">{data.members.map(member => {
        const editable = canManage && member.roleKey !== "organization.owner" && member.user.id !== actorUserId;
        return <div key={member.id} className="grid gap-3 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0"><p className="font-semibold">{member.user.displayName || member.user.email}</p><p className="text-sm text-foreground-muted">{member.user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2"><StatusBadge>{member.status}</StatusBadge><span className="text-sm">{data.roles.find(r => r.key === member.roleKey)?.name ?? member.roleKey}</span></div></div>
          {editable && <div className="flex flex-wrap items-center gap-2">
            {member.status === "ACTIVE" && <><label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.user.email}</label>
              <Select id={`role-${member.id}`} value={roleEdits[member.id] ?? member.roleKey ?? "organization.member"} onChange={e => setRoleEdits(current => ({ ...current, [member.id]: e.target.value }))}>
                {data.roles.map(role => <option key={role.key} value={role.key}>{role.name}</option>)}</Select>
              <Button type="button" variant="outline" disabled={Boolean(working) || (roleEdits[member.id] ?? member.roleKey) === member.roleKey}
                onClick={() => void run(member.id, () => api.changeOrganizationStaffRole(organizationId, member.id, roleEdits[member.id] ?? member.roleKey!), "Staff role updated.")}>Update role</Button></>}
            <Button type="button" variant="destructive" disabled={Boolean(working)} onClick={() => {
              if (window.confirm(`Remove ${member.user.email} from this organization?`))
                void run(member.id, () => api.removeOrganizationStaff(organizationId, member.id), "Staff access removed.");
            }}>Remove</Button>
          </div>}
        </div>;
      })}</div>}
    </Card>}
  </>;
}

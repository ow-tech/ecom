"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, type OrganizationStaffList } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, PageHeader, Select, Skeleton, StatusBadge } from "./ui";

export function SupplierStaffManagement({ organizationId, permissions, actorUserId }: { organizationId: string; permissions: string[]; actorUserId: string }) {
  const canRead = permissions.includes("organization.members.read");
  const canManage = permissions.includes("organization.staff.manage");
  const [data, setData] = useState<OrganizationStaffList>();
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof api.supplierStaffInvitations>>>([]);
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
    try { const [members, pending] = await Promise.all([api.organizationStaff(organizationId), api.supplierStaffInvitations(organizationId)]); setData(members); setInvites(pending); }
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
    await run("invite", () => api.inviteOrganizationStaff(organizationId, { email: inviteEmail.trim(), roleKey: inviteRole }), "Invitation accepted by email provider. The recipient must use the emailed link to activate.");
    // Do not wipe recipient input on failure; the operator may correct it.
  }
  if (!canRead) return <EmptyState title="Permission denied" detail="Your organization role cannot view staff records." />;
  return <><PageHeader eyebrow="Supplier workspace" title="Staff and permissions" description="Organization access is granted only after the invited Ecom account accepts its role."/>
    {error && <div className="mt-5"><ErrorState detail={error} retry={() => void load()}/></div>}
    {notice && <div className="mt-5"><Alert tone="success">{notice}</Alert></div>}
    {canManage && <Card className="mt-7"><h2 className="font-bold">Invite employee by email</h2><p className="mt-1 text-sm text-foreground-muted">Enter a workforce email and select a role. The recipient sets a password through the secure email link. Customer emails cannot be used.</p>
      <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <FormField label="Staff email"><Input type="email" autoComplete="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}/></FormField>
        <FormField label="Staff role"><Select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>{(data?.roles ?? []).map(role => <option value={role.key} key={role.key}>{role.name}</option>)}</Select></FormField>
        <Button type="submit" loading={working === "invite"} disabled={!data?.roles.length || Boolean(working)}>Send invitation</Button>
      </form>
    </Card>}
    <Card className="mt-7"><h2 className="font-bold">Email invitations</h2>
      {!invites.length ? <p className="mt-3 text-sm text-foreground-muted">No invitations yet.</p> :
      <div className="mt-4 space-y-3">{invites.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div><p className="font-semibold">{invite.email}</p><p className="text-sm text-foreground-muted">{invite.roleKey} · {invite.emailedAt ? "Provider accepted" : "Awaiting email delivery"}</p>
          <StatusBadge>{invite.status}</StatusBadge></div>
        {canManage && invite.status === "PENDING" && <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={Boolean(working)} onClick={() => void run(invite.id + ":resend", () => api.resendSupplierStaffInvitation(organizationId, invite.id), "Invitation resent.")}>Resend</Button>
          <Button type="button" variant="destructive" disabled={Boolean(working)} onClick={() => { if(window.confirm("Revoke this invitation?")) void run(invite.id + ":revoke", () => api.revokeSupplierStaffInvitation(organizationId, invite.id), "Invitation revoked."); }}>Revoke</Button>
        </div>}
      </div>)}</div>}
    </Card>
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

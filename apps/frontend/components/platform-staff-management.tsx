"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, Select, StatusBadge } from "./ui";

const ordinaryRoles = [
  ["platform.operations_admin","Operations admin"],
  ["platform.support_admin","Support admin"],
  ["platform.audit_viewer","Audit viewer"],
] as const;

export function PlatformStaffManagement({permissions, actorUserId}: {permissions:string[];actorUserId:string}) {
  const canManage=permissions.includes("platform.staff.manage");
  const canManageHead=permissions.includes("platform.head_admin.manage");
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("platform.operations_admin");
  const [people,setPeople]=useState<Awaited<ReturnType<typeof api.platformStaff>>>([]);
  const [invites,setInvites]=useState<Awaited<ReturnType<typeof api.platformStaffInvitations>>>([]);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    const [members,pending]=await Promise.all([api.platformStaff(),api.platformStaffInvitations()]);
    setPeople(members);setInvites(pending);
  },[]);
  useEffect(()=>{void load().catch(c=>setError(c instanceof Error?c.message:"Could not load staff."));},[load]);
  async function run(work:()=>Promise<unknown>,success:string){
    if(working)return;
    setWorking(true);setError("");setNotice("");
    try{await work();await load();setNotice(success);}
    catch(c){setError(c instanceof Error?c.message:"Request failed.");}
    finally{setWorking(false);}
  }
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    await run(()=>api.invitePlatformStaff(email.trim(),role),"Invitation accepted by email provider.");
  }
  const roles=canManageHead?[...ordinaryRoles,["platform.head_admin","Head admin"] as const]:ordinaryRoles;
  return <div className="mt-8 space-y-6">
    {error&&<ErrorState detail={error} retry={()=>void load()}/>}
    {notice&&<Alert tone="success">{notice}</Alert>}
    {canManage&&<Card><h2 className="font-bold">Invite platform employee</h2>
      <p className="mt-2 text-sm text-foreground-muted">Email-based invitation. New workforce users set their password through a one-time link. Super-admin access cannot be delegated here.</p>
      <form onSubmit={send} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
        <FormField label="Email"><Input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></FormField>
        <FormField label="Platform role"><Select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(([key,name])=><option key={key} value={key}>{name}</option>)}</Select></FormField>
        <Button type="submit" loading={working}>Send invitation</Button>
      </form>
    </Card>}
    <Card><h2 className="font-bold">Pending invitations</h2>
      {!invites.length?<div className="mt-3"><EmptyState title="No platform invitations" detail="New email invitations will appear here."/></div>:<div className="mt-4 space-y-3">{invites.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div><p className="font-semibold">{item.email}</p><p className="text-sm text-foreground-muted">{item.roleKey}</p><StatusBadge>{item.status}</StatusBadge></div>
        {canManage&&item.status==="PENDING"&&<div className="flex gap-2"><Button type="button" variant="outline" disabled={working} onClick={()=>void run(()=>api.resendPlatformStaffInvitation(item.id),"Invitation resent.")}>Resend</Button>
          <Button type="button" variant="destructive" disabled={working} onClick={()=>{if(window.confirm("Revoke this invitation?")) void run(()=>api.revokePlatformStaffInvitation(item.id),"Invitation revoked.");}}>Revoke</Button></div>}
      </div>)}</div>}
    </Card>
    <Card><h2 className="font-bold">Platform administrators</h2>
      {!people.length?<div className="mt-3"><EmptyState title="No platform staff found" detail="Staff directory is empty."/></div>:<div className="mt-4 space-y-4">{people.map(person=><div key={person.id} className="border-b border-border pb-3">
        <p className="font-semibold">{person.displayName||person.email}</p><p className="text-sm text-foreground-muted">{person.email}</p>
        <div className="mt-2 flex flex-wrap gap-2">{person.roles.map(r=><StatusBadge key={r}>{r}</StatusBadge>)}</div>
        {canManage&&person.id!==actorUserId&&!person.roles.includes("platform.super_admin")&&(!person.roles.includes("platform.head_admin")||canManageHead)&&<div className="mt-3 flex flex-wrap gap-2">
          {roles.map(([key,name])=><Button type="button" key={key} variant="outline" disabled={working} onClick={()=>void run(()=>api.changePlatformStaffRole(person.id,key,!person.roles.includes(key)),person.roles.includes(key)?"Role revoked.":"Role granted.")}>{person.roles.includes(key)?"Revoke":"Grant"} {name}</Button>)}
        </div>}
      </div>)}</div>}
    </Card>
  </div>;
}

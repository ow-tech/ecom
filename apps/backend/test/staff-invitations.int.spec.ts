import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/prisma/prisma.service";
import { AppModule } from "../src/app.module";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

const prefix = `staff-invite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const password = "SecureDevelopmentPassword#2026";
type ResponseShape = { status: number; body: any; headers: Record<string,string|string[]|undefined> };

describe("staff invitations — live HTTP/PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const email=(label:string)=>`${prefix}-${label}@example.test`;
  const invitationLinks: string[]=[];
  const env: Record<string,string|undefined>={};

  async function http(method:string,path:string,body?:unknown,cookie?:string):Promise<ResponseShape>{
    return new Promise((resolve,reject)=>{
      const payload=body===undefined?undefined:JSON.stringify(body);
      const req=httpRequest(url+path,{method,headers:{
        ...(payload?{"content-type":"application/json","content-length":Buffer.byteLength(payload)}:{}),
        ...(cookie?{cookie}:{})
      }},res=>{
        const chunks:Buffer[]=[];
        res.on("data",(chunk:Buffer)=>chunks.push(chunk));
        res.on("end",()=>{
          const text=Buffer.concat(chunks).toString("utf8");
          resolve({status:res.statusCode??0,body:text?JSON.parse(text):undefined,headers:res.headers});
        });
      });
      req.on("error",reject);if(payload)req.write(payload);req.end();
    });
  }
  async function workforce(label:string){
    const res=await http("POST","/auth/workforce/register",{email:email(label),password});
    expect(res.status).toBe(201);
    const cookie=(res.headers["set-cookie"] as string[])[0].split(";",1)[0];
    return {id:res.body.id,cookie};
  }

  beforeAll(async()=>{
    for(const key of ["BREVO_API_KEY","BREVO_FROM_EMAIL","ACCOUNT_PUBLIC_URL"]){
      env[key]=process.env[key];
    }
    process.env.BREVO_API_KEY="test-key-not-sent";
    process.env.BREVO_FROM_EMAIL="sender@example.test";
    process.env.ACCOUNT_PUBLIC_URL="http://localhost:3100";
    const send=global.fetch;
    global.fetch=jest.fn(async (_input:string|URL|Request,opts?:RequestInit)=>{
      const body=JSON.parse(String(opts?.body??"{}")) as {textContent:string};
      const match=body.textContent.match(/https?:\/\/\S+/);
      if(match)invitationLinks.push(match[0]);
      return {ok:true,status:201,json:async()=>({messageId:"test-delivery-id"})} as Response;
    }) as typeof fetch;
    savedFetch=send;
    const module=await Test.createTestingModule({imports:[AppModule]}).compile();
    app=module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
    await app.listen(0,"127.0.0.1");
    url=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma=app.get(PrismaService);
  });
  let savedFetch: typeof fetch;

  afterAll(async()=>{
    if(prisma){
      await prisma.staffInvitation.deleteMany({where:{emailNormalized:{startsWith:prefix}}});
      await prisma.auditEvent.deleteMany({where:{actorUser:{emailNormalized:{startsWith:prefix}}}});
      await prisma.organization.deleteMany({where:{slug:{startsWith:prefix}}});
      await prisma.user.deleteMany({where:{emailNormalized:{startsWith:prefix}}});
    }
    if(app)await app.close();
    if(savedFetch)global.fetch=savedFetch;
    for(const [key,value] of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });

  it("blocks customer sign-up while pending and accepts invitation once with a new workforce password",async()=>{
    const owner=await workforce("owner");
    const organization=await http("POST","/organizations",{name:prefix,slug:prefix},owner.cookie);
    expect(organization.status).toBe(201);
    const id=organization.body.id as string;
    const recipient=email("new-employee");
    const invited=await http("POST",`/organizations/${id}/staff-invitations`,{email:recipient,roleKey:"organization.member"},owner.cookie);
    expect(invited.status).toBe(201);
    expect(invited.body.delivery).toBe("ACCEPTED_BY_PROVIDER");
    const duplicate=await http("POST","/auth/register",{email:recipient,password});
    expect(duplicate.status).toBe(409);
    const raw=new URLSearchParams(new URL(invitationLinks.at(-1)!).hash.slice(1)).get("token")!;
    const accepted=await http("POST","/staff-invitations/accept",{token:raw,password});
    expect(accepted.status).toBe(201);
    const replay=await http("POST","/staff-invitations/accept",{token:raw,password});
    expect(replay.status).toBe(400);
    expect((await http("POST","/auth/workforce/login",{email:recipient,password})).status).toBe(201);
    expect((await http("POST","/auth/login",{email:recipient,password})).status).toBe(401);
    const row=await prisma.staffInvitation.findUniqueOrThrow({where:{id:invited.body.id}});
    expect(row.tokenHash).toBeNull();
    expect(row.status).toBe("ACCEPTED");
    const staffLogin = await http("POST", "/auth/workforce/login", { email: recipient, password });
    const staffCookie = (staffLogin.headers["set-cookie"] as string[])[0].split(";", 1)[0];
    expect((await http("GET", `/organizations/${id}/members`, undefined, staffCookie)).status).toBe(200);
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: id, userId: row.acceptedByUserId! } },
    });
    const changed = await http("PATCH", `/organizations/${id}/members/${membership.id}/role`,
      { roleKey: "organization.inventory_staff" }, owner.cookie);
    expect(changed.status).toBe(200);
    expect((await http("GET", `/organizations/${id}/members`, undefined, staffCookie)).status).toBe(403);
    const removed = await http("DELETE", `/organizations/${id}/members/${membership.id}`, undefined, owner.cookie);
    expect(removed.status).toBe(200);
    const activeAfterRemoval = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(activeAfterRemoval.status).toBe("REMOVED");
    expect((await http("GET", `/organizations/${id}/members`, undefined, staffCookie)).status).toBe(403);
    const audits = await prisma.auditEvent.findMany({ where: { entityId: membership.id,
      action: { in: ["SUPPLIER_STAFF_ROLE_CHANGED", "SUPPLIER_STAFF_REMOVED"] } } });
    expect(audits).toHaveLength(2);
  });

  it("rejects customer-account invitations and legacy unverified invitation endpoint",async()=>{
    const owner=await workforce("second-owner");
    const organization=await http("POST","/organizations",{name:prefix+" 2",slug:prefix+"-two"},owner.cookie);
    expect(organization.status).toBe(201);
    const customer=await http("POST","/auth/register",{email:email("customer"),password});
    expect(customer.status).toBe(201);
    const id=organization.body.id;
    const blocked=await http("POST",`/organizations/${id}/staff-invitations`,{email:email("customer"),roleKey:"organization.member"},owner.cookie);
    expect(blocked.status).toBe(409);
    const old=await http("POST",`/organizations/${id}/members/invite`,{email:email("customer"),roleKey:"organization.member"},owner.cookie);
    expect(old.status).toBe(410);
  });
});

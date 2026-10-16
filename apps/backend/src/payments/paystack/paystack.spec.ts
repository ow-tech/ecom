import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import { mapPaystackStatus, normalizePaystackEvidence } from "./paystack-mapper";
import { toPaystackMinorUnits } from "./paystack-money";
import { PaystackSignatureService } from "./paystack-signature.service";
import { PaystackClient } from "./paystack.client";
import { PaystackProviderError } from "./paystack.types";

const values: Record<string, unknown> = { PAYSTACK_SECRET_KEY: "test-secret", PAYSTACK_BASE_URL: "https://api.test", PAYSTACK_TIMEOUT_MS: 5 };
const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => { if (!(key in values)) throw new Error(key); return values[key]; } } as ConfigService;

describe("Paystack canonical helpers", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([["0.01", "1"], ["1.00", "100"], ["999999999999.99", "99999999999999"]])("converts Decimal %s exactly to minor units", (major, minor) => {
    expect(toPaystackMinorUnits(new Prisma.Decimal(major), "KES")).toBe(minor);
  });

  it("maps only documented success to SUCCEEDED and preserves unresolved statuses", () => {
    expect(mapPaystackStatus("success")).toBe("SUCCEEDED");
    expect(mapPaystackStatus("pending")).toBe("PENDING");
    expect(mapPaystackStatus("processing")).toBe("PENDING");
    expect(mapPaystackStatus("failed")).toBe("FAILED");
    expect(mapPaystackStatus("future_status")).toBe("UNKNOWN");
  });

  it("normalizes authoritative fields without floating point", () => {
    expect(normalizePaystackEvidence({ reference: "ref", status: "success", amount: 10001, currency: "kes", customer: { email: "TEST@EXAMPLE.COM" } })).toMatchObject({ reference: "ref", providerStatus: "success", amountMinor: "10001", currency: "KES", customerEmail: "test@example.com" });
  });

  it("verifies the exact raw body with HMAC SHA512", () => {
    const service = new PaystackSignatureService(config);
    const raw = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac("sha512", "test-secret").update(raw).digest("hex");
    expect(service.verify(raw, signature)).toBe(true);
    expect(service.verify(Buffer.from("{}"), signature)).toBe(false);
  });

  it("initializes with a server supplied reference and normalizes the response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "EC_ref", authorization_url: "https://checkout.test/ref", access_code: "access" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await new PaystackClient(config).initialize({ reference: "EC_ref", amountMinor: "100", currency: "KES", email: "a@example.com", orderId: "order", channel: "card" });
    expect(result.reference).toBe("EC_ref");
    expect(fetch).toHaveBeenCalledWith("https://api.test/transaction/initialize", expect.objectContaining({ method: "POST" }));
    const request = JSON.parse((jest.mocked(fetch).mock.calls[0][1]?.body as string));
    expect(request).toMatchObject({ reference: "EC_ref", amount: "100", currency: "KES", email: "a@example.com", channels: ["card"] });
  });

  it("forwards a server-generated callback URL without accepting one from a browser", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "EC_ref", authorization_url: "https://checkout.test/ref", access_code: "access" } }), { status: 200, headers: { "content-type": "application/json" } }));
    await new PaystackClient(config).initialize({ reference: "EC_ref", amountMinor: "100", currency: "KES", email: "a@example.com", orderId: "order", channel: "card", callbackUrl: "https://shop.test/checkout/payment/order?paymentId=payment" });
    const request = JSON.parse((jest.mocked(fetch).mock.calls[0][1]?.body as string));
    expect(request.callback_url).toBe("https://shop.test/checkout/payment/order?paymentId=payment");
  });

  it("treats an initialization timeout as ambiguous", async () => {
    jest.spyOn(global, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    await expect(new PaystackClient(config).initialize({ reference: "EC_ref", amountMinor: "100", currency: "KES", email: "a@example.com", orderId: "order", channel: "card" })).rejects.toMatchObject<Partial<PaystackProviderError>>({ ambiguous: true, code: "TIMEOUT" });
  });

  it("classifies provider authorization and network failures separately", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ status: false, message: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }));
    await expect(new PaystackClient(config).verify("ref")).rejects.toMatchObject<Partial<PaystackProviderError>>({ ambiguous: false, code: "HTTP_401" });

    jest.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(new PaystackClient(config).verify("ref")).rejects.toMatchObject<Partial<PaystackProviderError>>({ ambiguous: true, code: "NETWORK_ERROR" });
  });

  it("treats a malformed initialization response as ambiguous", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "EC_ref" } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(new PaystackClient(config).initialize({ reference: "EC_ref", amountMinor: "100", currency: "KES", email: "a@example.com", orderId: "order", channel: "card" })).rejects.toMatchObject<Partial<PaystackProviderError>>({ ambiguous: true, code: "MALFORMED_RESPONSE" });
  });

  it("rejects malformed verification evidence conservatively", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "ref", status: "success" } }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(new PaystackClient(config).verify("ref")).rejects.toMatchObject<Partial<PaystackProviderError>>({ ambiguous: true, code: "MALFORMED_RESPONSE" });
  });
});

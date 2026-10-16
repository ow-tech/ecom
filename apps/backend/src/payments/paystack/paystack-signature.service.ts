import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

@Injectable()
export class PaystackSignatureService {
  constructor(private readonly config: ConfigService) {}

  sign(rawBody: Buffer): string {
    return createHmac("sha512", this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY")).update(rawBody).digest("hex");
  }

  verify(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
    const expected = Buffer.from(this.sign(rawBody), "hex");
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}

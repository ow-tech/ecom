import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { OperationalOutboxProcessor } from "./outbox.processor";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const result = await app.get(OperationalOutboxProcessor).processBatch(process.env.OUTBOX_WORKER_ID);
    console.log(`operations worker claimed=${result.claimed}`);
  }
  finally { await app.close(); }
}
main().catch((error) => {
  // A worker must not report a successful one-shot run if bootstrap or the
  // bounded processor failed before it could claim its assigned work.
  console.error(error);
  process.exitCode = 1;
});

type Environment = Record<string, unknown>;

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validUrl(value: string, name: string, protocols: readonly string[]): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}: expected a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`Invalid ${name}: unsupported protocol ${parsed.protocol}`);
  }

  return value;
}

function validPort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid BACKEND_PORT: expected an integer between 1 and 65535");
  }

  return port;
}

function positiveInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}: expected a positive integer`);
  return parsed;
}

function decimalFraction(value: unknown, name: string, fallback: string): string {
  const resolved = value === undefined || value === "" ? fallback : String(value);
  if (!/^(0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/.test(resolved)) throw new Error(`Invalid ${name}: expected a decimal fraction from 0 to 1`);
  return resolved;
}

function booleanFlag(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`Invalid ${name}: expected true or false`);
}

export function validateEnvironment(config: Environment): Environment {
  const databaseUrl = requiredString(config.DATABASE_URL, "DATABASE_URL");
  const redisUrl = requiredString(config.REDIS_URL, "REDIS_URL");
  const backendPort = requiredString(config.BACKEND_PORT, "BACKEND_PORT");
  const paystackSecretKey = requiredString(config.PAYSTACK_SECRET_KEY, "PAYSTACK_SECRET_KEY");
  const collectionCodeSecret = requiredString(config.COLLECTION_CODE_SECRET, "COLLECTION_CODE_SECRET");
  const paystackBaseUrl = typeof config.PAYSTACK_BASE_URL === "string" && config.PAYSTACK_BASE_URL ? config.PAYSTACK_BASE_URL : "https://api.paystack.co";
  const paystackCallbackBaseUrl = typeof config.PAYSTACK_CALLBACK_BASE_URL === "string" && config.PAYSTACK_CALLBACK_BASE_URL ? validUrl(config.PAYSTACK_CALLBACK_BASE_URL, "PAYSTACK_CALLBACK_BASE_URL", ["http:", "https:"]).replace(/\/$/, "") : undefined;

  const nodeEnv = typeof config.NODE_ENV === "string" ? config.NODE_ENV : "development";
  const paystackEnvironment = typeof config.PAYSTACK_ENVIRONMENT === "string" ? config.PAYSTACK_ENVIRONMENT : "test";
  if (paystackEnvironment !== "test" && paystackEnvironment !== "live") throw new Error("Invalid PAYSTACK_ENVIRONMENT: expected test or live");
  if (/REPLACE_WITH|CHANGE_ME|example/i.test(paystackSecretKey)) throw new Error("PAYSTACK_SECRET_KEY must be a real service key, not a placeholder");
  if (/CHANGE_ME|GENERATE_USING|example/i.test(collectionCodeSecret)) throw new Error("COLLECTION_CODE_SECRET must be generated, not a placeholder");
  if (paystackSecretKey.startsWith("sk_live_") && !(nodeEnv === "production" && paystackEnvironment === "live")) throw new Error("PAYSTACK_SECRET_KEY live keys require NODE_ENV=production and PAYSTACK_ENVIRONMENT=live");
  if (paystackEnvironment === "live" && !paystackSecretKey.startsWith("sk_live_")) throw new Error("PAYSTACK_ENVIRONMENT=live requires an sk_live_ key");
  if (paystackEnvironment === "test" && !paystackSecretKey.startsWith("sk_test_")) throw new Error("PAYSTACK_ENVIRONMENT=test requires an sk_test_ key");
  return {
    ...config,
    DATABASE_URL: validUrl(databaseUrl, "DATABASE_URL", ["postgresql:", "postgres:"]),
    REDIS_URL: validUrl(redisUrl, "REDIS_URL", ["redis:", "rediss:"]),
    BACKEND_PORT: validPort(backendPort),
    SESSION_COOKIE_NAME: typeof config.SESSION_COOKIE_NAME === "string" && config.SESSION_COOKIE_NAME ? config.SESSION_COOKIE_NAME : "ecom_session",
    NODE_ENV: nodeEnv,
    CHECKOUT_RESERVATION_TTL_MINUTES: positiveInteger(config.CHECKOUT_RESERVATION_TTL_MINUTES, "CHECKOUT_RESERVATION_TTL_MINUTES", 15),
    PAYSTACK_SECRET_KEY: paystackSecretKey,
    PAYSTACK_ENVIRONMENT: paystackEnvironment,
    PAYSTACK_MPESA_ENABLED: booleanFlag(config.PAYSTACK_MPESA_ENABLED, "PAYSTACK_MPESA_ENABLED", false),
    COLLECTION_CODE_SECRET: collectionCodeSecret,
    PAYSTACK_BASE_URL: validUrl(paystackBaseUrl, "PAYSTACK_BASE_URL", ["http:", "https:"]).replace(/\/$/, ""),
    PAYSTACK_CALLBACK_BASE_URL: paystackCallbackBaseUrl,
    PAYSTACK_TIMEOUT_MS: positiveInteger(config.PAYSTACK_TIMEOUT_MS, "PAYSTACK_TIMEOUT_MS", 10_000),
    RESERVATION_EXPIRY_BATCH_SIZE: positiveInteger(config.RESERVATION_EXPIRY_BATCH_SIZE, "RESERVATION_EXPIRY_BATCH_SIZE", 100),
    RETURN_WINDOW_DAYS: positiveInteger(config.RETURN_WINDOW_DAYS, "RETURN_WINDOW_DAYS", 30),
    DEFAULT_COMMISSION_RATE: decimalFraction(config.DEFAULT_COMMISSION_RATE, "DEFAULT_COMMISSION_RATE", "0.10"),
  };
}

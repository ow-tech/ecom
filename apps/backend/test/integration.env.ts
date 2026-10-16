const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

if (process.env.DATABASE_URL) {
  const testDatabase = new URL(testDatabaseUrl);
  const activeDatabase = new URL(process.env.DATABASE_URL);
  if (testDatabase.protocol === activeDatabase.protocol && testDatabase.host === activeDatabase.host && testDatabase.pathname === activeDatabase.pathname) {
    throw new Error("TEST_DATABASE_URL must not identify the active DATABASE_URL database");
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.BACKEND_PORT ??= "4001";
process.env.SESSION_COOKIE_NAME ??= "ecom_test_session";
process.env.NODE_ENV = "test";
// Integration proof must never inherit a developer or deployment credential.
process.env.PAYSTACK_SECRET_KEY = "sk_test_integration_only";
process.env.PAYSTACK_ENVIRONMENT = "test";
process.env.COLLECTION_CODE_SECRET ??= "collection_test_integration_only";
process.env.PAYSTACK_BASE_URL = "http://127.0.0.1:9";

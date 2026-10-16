import { validateEnvironment } from "./environment.validation";

const valid = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/ecom",
  REDIS_URL: "redis://localhost:6379",
  BACKEND_PORT: "4000",
  PAYSTACK_SECRET_KEY: "sk_test_unit_only",
  COLLECTION_CODE_SECRET: "unit-only-collection-secret",
};

describe("Paystack environment validation", () => {
  it("fails clearly when the server secret is missing", () => {
    expect(() => validateEnvironment({ ...valid, PAYSTACK_SECRET_KEY: undefined })).toThrow("Missing required environment variable: PAYSTACK_SECRET_KEY");
  });

  it("rejects the documented placeholder instead of starting a broken checkout", () => {
    expect(() => validateEnvironment({ ...valid, PAYSTACK_SECRET_KEY: "sk_test_REPLACE_WITH_YOUR_OWN_TEST_SECRET" })).toThrow("PAYSTACK_SECRET_KEY must be a real service key, not a placeholder");
  });

  it("defaults M-Pesa off for a valid test configuration", () => {
    expect(validateEnvironment(valid)).toEqual(expect.objectContaining({ PAYSTACK_ENVIRONMENT: "test", PAYSTACK_MPESA_ENABLED: false }));
  });
});

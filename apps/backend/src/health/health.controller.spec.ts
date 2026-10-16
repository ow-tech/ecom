import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns an opaque successful status", () => {
    expect(new HealthController().health()).toEqual({ status: "ok" });
  });
});

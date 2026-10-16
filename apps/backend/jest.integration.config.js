const base = require("./jest.config");

module.exports = {
  ...base,
  testRegex: "test/.*\\.int\\.spec\\.ts$",
  setupFiles: ["<rootDir>/test/integration.env.ts"],
};

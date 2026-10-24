module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@fluivix/ui-tokens/native$":
      "<rootDir>/../../packages/ui-tokens/native.ts",
  },
};

import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["shared/globalPromotion.test.ts", "shared/globalPromotion.schedule.test.ts", "shared/globalPromotion.weeklyWindows.test.ts", "server/vipPricing.test.ts"],
    testTimeout: 15000,
  },
});

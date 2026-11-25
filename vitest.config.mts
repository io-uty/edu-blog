import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src("./src"),
      // server-only 는 번들러 전용 가드라 테스트(순수 Node)에서는 빈 모듈로 대체한다
      "server-only": src("./tests/empty.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});

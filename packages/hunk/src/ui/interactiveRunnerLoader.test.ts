import { describe, expect, test } from "bun:test";
import {
  createInteractiveRunnerLoader,
  type InteractiveRunnerImports,
} from "./interactiveRunnerLoader";

type ReviewModule = Awaited<ReturnType<InteractiveRunnerImports["review"]>>;
type HistoryModule = Awaited<ReturnType<InteractiveRunnerImports["history"]>>;

function createCountingImports() {
  const counts = { review: 0, history: 0 };
  const imports: InteractiveRunnerImports = {
    review: async () => {
      counts.review += 1;
      return { runInteractiveApp: async () => {} } as unknown as ReviewModule;
    },
    history: async () => {
      counts.history += 1;
      return { runInteractiveHistory: async () => {} } as unknown as HistoryModule;
    },
  };
  return { counts, imports };
}

describe("interactive runner loader", () => {
  test("begin starts the surface import once and load reuses it", async () => {
    const { counts, imports } = createCountingImports();
    const loader = createInteractiveRunnerLoader(imports);

    loader.begin("review");
    loader.begin("review");
    expect(counts).toEqual({ review: 1, history: 0 });

    const first = loader.loadReviewRunner();
    const second = loader.loadReviewRunner();
    expect(first).toBe(second);
    await first;
    expect(counts).toEqual({ review: 1, history: 0 });
  });

  test("load imports lazily when startup never announced the surface", async () => {
    const { counts, imports } = createCountingImports();
    const loader = createInteractiveRunnerLoader(imports);

    expect(counts).toEqual({ review: 0, history: 0 });
    await loader.loadHistoryRunner();
    expect(counts).toEqual({ review: 0, history: 1 });
  });

  test("an early import failure stays quiet until the runner is requested", async () => {
    const failure = new Error("native library unavailable");
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const loader = createInteractiveRunnerLoader({
        review: () => Promise.reject(failure),
        history: () => Promise.reject(failure),
      });

      loader.begin("review");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);

      await expect(loader.loadReviewRunner()).rejects.toBe(failure);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

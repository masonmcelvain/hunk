/**
 * Loads the interactive runner modules on demand and lets startup begin that load early.
 *
 * Importing `runInteractiveApp` or `runInteractiveHistory` evaluates OpenTUI, whose module scope
 * opens the embedded native library. Headless commands must never pay that cost, so both stay
 * behind dynamic `import()` calls; but once startup has committed to an interactive surface the
 * import can run while the remaining VCS and extension bootstrap waits on subprocesses. `begin`
 * starts that import at most once per surface, and the matching `load*` call reuses it.
 *
 * A started import is observed only when its surface actually runs. If bootstrap fails first,
 * the plan never reaches the runner, so the import's own rejection is marked handled here to
 * avoid an unhandled-rejection report on top of the bootstrap error; `load*` still rethrows it.
 */

export type InteractiveRunnerSurface = "review" | "history";

type ReviewRunnerModule = typeof import("./runInteractiveApp");
type HistoryRunnerModule = typeof import("./history/runInteractiveHistory");

export interface InteractiveRunnerImports {
  review: () => Promise<ReviewRunnerModule>;
  history: () => Promise<HistoryRunnerModule>;
}

export interface InteractiveRunnerLoader {
  /** Start importing the runner for `surface`; later calls for the same surface are no-ops. */
  begin: (surface: InteractiveRunnerSurface) => void;
  loadReviewRunner: () => Promise<ReviewRunnerModule>;
  loadHistoryRunner: () => Promise<HistoryRunnerModule>;
}

const defaultImports: InteractiveRunnerImports = {
  review: () => import("./runInteractiveApp"),
  history: () => import("./history/runInteractiveHistory"),
};

/** Memoize one import so `begin` and `load` share a single evaluation. */
function createSharedImport<Module>(load: () => Promise<Module>) {
  let pending: Promise<Module> | undefined;
  return () => {
    if (!pending) {
      pending = load();
      pending.catch(() => {});
    }
    return pending;
  };
}

/** Create a loader whose imports default to the real runner modules. */
export function createInteractiveRunnerLoader(
  imports: InteractiveRunnerImports = defaultImports,
): InteractiveRunnerLoader {
  const review = createSharedImport(imports.review);
  const history = createSharedImport(imports.history);
  return {
    begin(surface) {
      void (surface === "review" ? review() : history());
    },
    loadReviewRunner: review,
    loadHistoryRunner: history,
  };
}

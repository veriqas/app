// Build/test verification.
//
// Ecosystem detection is a pure function of the manifest files present at the
// repository root (fully unit-testable, no Docker). ACTUAL execution runs
// untrusted repository code (e.g. `npm test` runs repo scripts) and therefore
// only happens through an injected sandbox executor. When no sandbox executor
// is available, build/test are recorded as SKIPPED — NEVER as PASS. Verification
// never fabricates a green build.

export type BuildTestStatus = "NOT_RUN" | "SKIPPED" | "PASS" | "FAIL";

export interface EcosystemPlan {
  ecosystem: string;          // e.g. "pnpm", "npm", "cargo", "go", "pip", "maven"
  installCommand?: string;
  buildCommand: string;
  testCommand: string;
}

/** Detect the build/test plan from the set of root-level filenames. */
export function detectEcosystem(rootFiles: Iterable<string>): EcosystemPlan | null {
  const files = new Set([...rootFiles].map(f => f.toLowerCase()));
  const has = (f: string) => files.has(f.toLowerCase());

  if (has("package.json")) {
    if (has("pnpm-lock.yaml")) return { ecosystem: "pnpm", installCommand: "pnpm install --frozen-lockfile", buildCommand: "pnpm run build", testCommand: "pnpm test" };
    if (has("yarn.lock"))      return { ecosystem: "yarn", installCommand: "yarn install --frozen-lockfile", buildCommand: "yarn build", testCommand: "yarn test" };
    if (has("package-lock.json")) return { ecosystem: "npm", installCommand: "npm ci", buildCommand: "npm run build", testCommand: "npm test" };
    return { ecosystem: "npm", installCommand: "npm install", buildCommand: "npm run build", testCommand: "npm test" };
  }
  if (has("cargo.toml")) return { ecosystem: "cargo", buildCommand: "cargo build", testCommand: "cargo test" };
  if (has("go.mod"))     return { ecosystem: "go", buildCommand: "go build ./...", testCommand: "go test ./..." };
  if (has("pyproject.toml")) return { ecosystem: "python-poetry", installCommand: "poetry install", buildCommand: "poetry build", testCommand: "poetry run pytest" };
  if (has("requirements.txt")) return { ecosystem: "python-pip", installCommand: "pip install -r requirements.txt", buildCommand: "python -m compileall .", testCommand: "pytest" };
  if (has("pom.xml"))    return { ecosystem: "maven", buildCommand: "mvn -q -DskipTests package", testCommand: "mvn -q test" };
  if (has("build.gradle") || has("build.gradle.kts")) return { ecosystem: "gradle", buildCommand: "gradle build -x test", testCommand: "gradle test" };
  return null;
}

export interface CommandOutcome {
  status: BuildTestStatus;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  note?: string;
}

// A sandbox executor runs a single command against an isolated workspace and
// returns its outcome. The real implementation (future/Docker) must enforce
// isolation, resource limits, network restrictions and secret redaction. When
// omitted, execution is skipped safely.
export type SandboxExecutor = (command: string, workspaceDir: string, timeoutMs: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface BuildTestParams {
  rootFiles: string[];
  workspaceDir: string;
  timeoutMs: number;
}

export interface BuildTestOutcome {
  plan: EcosystemPlan | null;
  build: CommandOutcome;
  test: CommandOutcome;
}

export async function runBuildAndTest(
  params: BuildTestParams,
  executor?: SandboxExecutor
): Promise<BuildTestOutcome> {
  const plan = detectEcosystem(params.rootFiles);

  if (!plan) {
    const note = "No recognised build system detected; build/test skipped.";
    return { plan: null, build: { status: "SKIPPED", note }, test: { status: "SKIPPED", note } };
  }
  if (!executor) {
    const note = "No sandbox executor configured; build/test skipped (never reported as PASS).";
    return {
      plan,
      build: { status: "SKIPPED", command: plan.buildCommand, note },
      test:  { status: "SKIPPED", command: plan.testCommand, note },
    };
  }

  const runOne = async (command: string): Promise<CommandOutcome> => {
    const startedAt = new Date();
    try {
      const { exitCode, stdout, stderr } = await executor(command, params.workspaceDir, params.timeoutMs);
      const finishedAt = new Date();
      return {
        status: exitCode === 0 ? "PASS" : "FAIL",
        command, exitCode, stdout, stderr,
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
    } catch (err) {
      const finishedAt = new Date();
      return {
        status: "FAIL", command,
        stderr: err instanceof Error ? err.message : String(err),
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
    }
  };

  const build = await runOne(plan.buildCommand);
  // If the build failed, don't run tests against a broken build.
  const test = build.status === "PASS" ? await runOne(plan.testCommand) : { status: "NOT_RUN" as BuildTestStatus, command: plan.testCommand, note: "Skipped because build did not pass." };
  return { plan, build, test };
}

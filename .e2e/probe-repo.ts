/** Scan-only probe: what would a given repo actually produce? No DB writes. */
import { runCryptoscanAst } from "@/lib/scanners/engines/cryptoscan-ast-engine";
import { runCryptoscanAstPy } from "@/lib/scanners/engines/cryptoscan-ast-py-engine";
import { cloneRepo } from "@/lib/scanners/engines/git-clone";

const REPOS = process.argv.slice(2);

async function main() {
  for (const repo of REPOS) {
    const t0 = Date.now();
    let dir = "", cleanup = () => {};
    try {
      ({ dir, cleanup } = await cloneRepo(repo));
    } catch (e) {
      console.log(`\n${repo}\n  CLONE FAILED: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    try {
      const ts = await runCryptoscanAst(dir, repo);
      const py = await runCryptoscanAstPy(dir, repo);
      const all = [...ts.findings, ...py.findings];
      const byAlgo = new Map<string, number>();
      for (const f of all) byAlgo.set(String(f.algorithm), (byAlgo.get(String(f.algorithm)) ?? 0) + 1);
      const files = new Set(all.map(f => f.file));
      console.log(`\n${repo}   (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      console.log(`  ts: ${ts.scan_stats?.files_parsed ?? 0} files -> ${ts.findings.length} findings | py: ${py.scan_stats?.files_parsed ?? 0} files -> ${py.findings.length} findings`);
      console.log(`  complete: ts=${ts.scan_stats?.complete} py=${py.scan_stats?.complete} | distinct files with findings: ${files.size}`);
      console.log("  algorithms: " + [...byAlgo.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}x${n}`).join(", "));
      const vulnerable = all.filter(f => f.quantum_risk === "VULNERABLE");
      console.log(`  quantum-vulnerable findings: ${vulnerable.length}`);
      for (const f of vulnerable.slice(0, 6)) console.log(`    ${f.algorithm} ${f.file}:${f.line}`);
    } finally { cleanup(); }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });

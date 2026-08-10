/**
 * OpenSCAP engine — runs SCAP compliance evaluation against an XCCDF profile.
 * Accepts a path to an XCCDF/datastream file as the target.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

export interface OpenscapRuleResult {
  id:       string;
  title:    string;
  result:   "pass" | "fail" | "notchecked" | "notapplicable" | "error";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface OpenscapOutput {
  profile:  string;
  score:    number;
  results:  OpenscapRuleResult[];
  dataFile: string;
}

// Default XCCDF profile for crypto hardening — use CIS or STIG if available
const DEFAULT_PROFILE = "xccdf_org.ssgproject.content_profile_cis";
const DATASTREAM_PATHS = [
  "/usr/share/xml/scap/ssg/content/ssg-rhel8-ds.xml",
  "/usr/share/xml/scap/ssg/content/ssg-ubuntu2204-ds.xml",
  "/usr/share/openscap/scap/content/ssg-ubuntu2004-ds.xml",
];

export async function isOpenscapAvailable(): Promise<boolean> {
  try {
    await execFileAsync("oscap", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runOpenscap(targets: string[]): Promise<OpenscapOutput> {
  // targets[0] is either a path to a datastream file or a profile name
  const dataFile = targets.find(t => t.endsWith(".xml") && fs.existsSync(t))
    ?? DATASTREAM_PATHS.find(p => fs.existsSync(p))
    ?? "";

  if (!dataFile) {
    return {
      profile: DEFAULT_PROFILE,
      score: 0,
      results: [],
      dataFile: "",
    };
  }

  const tmpDir  = os.tmpdir();
  const resultsFile = path.join(tmpDir, `oscap-results-${Date.now()}.xml`);

  try {
    await execFileAsync(
      "oscap",
      [
        "xccdf", "eval",
        "--profile",     DEFAULT_PROFILE,
        "--results",     resultsFile,
        "--report",      "/dev/null",
        "--oval-results",
        dataFile,
      ],
      { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {
    // oscap exits 2 on rule failures (normal)
  }

  // Parse results XML
  const results: OpenscapRuleResult[] = [];
  let score = 0;

  if (fs.existsSync(resultsFile)) {
    try {
      const xml = fs.readFileSync(resultsFile, "utf-8");
      const ruleMatches = xml.matchAll(
        /<rule-result[^>]*idref="([^"]+)"[^>]*severity="([^"]+)"[^>]*>[\s\S]*?<result>([^<]+)<\/result>[\s\S]*?<\/rule-result>/g
      );
      for (const m of ruleMatches) {
        results.push({
          id:          m[1],
          title:       m[1].replace(/xccdf_[^_]+_rule_/, "").replace(/_/g, " "),
          result:      m[3].trim() as OpenscapRuleResult["result"],
          severity:    m[2] as OpenscapRuleResult["severity"],
          description: "",
        });
      }
      const scoreMatch = xml.match(/<score[^>]*>([\d.]+)<\/score>/);
      score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    } finally {
      try { fs.unlinkSync(resultsFile); } catch { /* ignore */ }
    }
  }

  return { profile: DEFAULT_PROFILE, score, results, dataFile };
}

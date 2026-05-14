// banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js
//
// REQ-DIAGRAM-09, REQ-DIAGRAM-10, REQ-DIAGRAM-15 (Phase 270).
//
// PURPOSE
//   Diagram-completeness invariant: every service named in run-bank.sh SVC_LIST
//   must appear in at least one .mmd source at repo root. Also asserts the §0
//   emoji allowlist (⚠️ ✅ ❌) and the no-secret-values invariant so labels
//   never leak credentials.
//
// WHY A PURE FILE-READ TEST
//   Pitfall 5 in 270-RESEARCH.md: importing the diagram React component (or
//   ArchitectureTabsPanel) would create transitive imports heavy enough to
//   break the existing ArchitectureTabsPanel.anon.test.js. This test reads
//   files directly — no component import, no React render, no DOM bootstrap.
//
// RUN
//   cd banking_api_ui && CI=true npm test -- --watchAll=false \
//     --testPathPattern='ArchitectureDiagram.completeness'

const fs = require("fs");
const path = require("path");

// From banking_api_ui/src/components/__tests__/ to repo root: up 4 dirs.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const MMD_FILES = [
  "architecture-simple.mmd",
  "architecture.mmd",
  "i4ai-ref-arch.mmd",
  "mcp-security-gateway.mmd",
];

// Extract SVC_LIST from run-bank.sh (single source of truth).
// Pure-JS regex on the file content — no shell-out (Pitfall A6 in research).
function getServiceList() {
  const runBankPath = path.join(REPO_ROOT, "run-bank.sh");
  const content = fs.readFileSync(runBankPath, "utf8");
  const match = content.match(/^SVC_LIST=\(([^)]+)\)/m);
  if (!match) {
    throw new Error("Could not parse SVC_LIST=(...) from run-bank.sh");
  }
  return match[1].trim().split(/\s+/).filter(Boolean);
}

function loadAllMmdContent() {
  return MMD_FILES.map((file) => {
    const fullPath = path.join(REPO_ROOT, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Mermaid source missing: ${file} at ${fullPath}`);
    }
    return { file, content: fs.readFileSync(fullPath, "utf8") };
  });
}

describe("Architecture diagram completeness", () => {
  const services = getServiceList();
  const mmds = loadAllMmdContent();

  test("SVC_LIST parses to exactly 8 services", () => {
    expect(services).toHaveLength(8);
  });

  test.each(services)(
    'service "%s" appears in at least one .mmd source',
    (svc) => {
      const found = mmds.filter(({ content }) => content.includes(svc));
      if (found.length === 0) {
        throw new Error(
          `Service "${svc}" is in run-bank.sh SVC_LIST but appears in NONE of: ` +
            MMD_FILES.join(", ") +
            `. Add it to architecture-simple.mmd (clean view) or architecture.mmd (detailed view).`,
        );
      }
      expect(found.length).toBeGreaterThan(0);
    },
  );

  test("langchain_agent (Python service) appears in at least one .mmd source", () => {
    const found = mmds.filter(
      ({ content }) =>
        content.includes("langchain_agent") ||
        content.includes("LangChain Agent") ||
        content.includes("LangChain agent"),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  test.each([
    ["PingOne", "PingOne IDP name"],
    ["RFC 8693", "token-exchange RFC marker"],
    ["PKCE", "authorization-code+PKCE marker"],
    ["client_credentials", "CC grant marker"],
  ])(
    'OAuth grant marker "%s" (%s) appears in at least one .mmd source',
    (marker) => {
      const found = mmds.filter(({ content }) => content.includes(marker));
      expect(found.length).toBeGreaterThan(0);
    },
  );

  // REQ-DIAGRAM-05: Phase 266 three-path multi-issuer story must be represented
  test.each([
    ["Path A", "Phase 266 Path A (banking_api_server resource)"],
    ["Path B", "Phase 266 Path B (mortgage_service resource)"],
    ["Path C", "Phase 266 Path C (HITL service resource)"],
  ])(
    'Phase 266 marker "%s" (%s) appears in at least one .mmd source',
    (marker) => {
      const found = mmds.filter(({ content }) => content.includes(marker));
      expect(found.length).toBeGreaterThan(0);
    },
  );

  // REQ-DIAGRAM-07: Phase 269 vault startup-load arrow must be visible
  test('Phase 269 vault marker "secrets.vault" appears in at least one .mmd source', () => {
    const found = mmds.filter(({ content }) =>
      content.includes("secrets.vault"),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  describe("Security: no secret values in diagram labels (REQ-DIAGRAM-15)", () => {
    // FORBIDDEN: anything that looks like an actual secret value in an =-assignment.
    // ALLOWED:    header names like "X-API-Key:" since they are not value-bearing.
    const FORBIDDEN_PATTERNS = [
      { re: /VAULT_PASSWORD\s*=\s*\S/, name: "VAULT_PASSWORD=value" },
      { re: /client_secret\s*=\s*\S/, name: "client_secret=value" },
      { re: /_SECRET\s*=\s*[^"\s]/, name: "*_SECRET=value" },
      // api_key=... when followed by something that isn't whitespace/quote.
      // The `=` requirement alone disambiguates header references like
      // "X-API-Key:" (uses `:`, not `=`) from value-bearing assignments.
      { re: /\bapi_key\s*=\s*[^\s"][^\s"]*/i, name: "api_key=value" },
    ];

    test.each(MMD_FILES)("%s contains no secret-value substring", (file) => {
      const { content } = mmds.find((m) => m.file === file);
      for (const { re, name } of FORBIDDEN_PATTERNS) {
        const match = content.match(re);
        if (match) {
          throw new Error(
            `${file} contains a secret-value pattern (${name}): "${match[0]}". ` +
              `Diagram labels MUST reference mechanisms (e.g. "startup-load", "X-API-Key"), ` +
              `never values.`,
          );
        }
      }
    });

    // Regression: prior regex used `[^X\s"]` which silently allowed any
    // api_key=X... value through (e.g. "api_key=Xabcd1234567890"). The fix
    // drops the X-exclusion. This synthetic test pins detection capability.
    test("api_key=value pattern catches values starting with X", () => {
      const synthetic = "node[Service api_key=Xabcd1234567890 here]";
      const apiKeyPattern = FORBIDDEN_PATTERNS.find(
        (p) => p.name === "api_key=value",
      ).re;
      expect(synthetic).toMatch(apiKeyPattern);
    });
  });

  describe("Style: §0 emoji allowlist enforced (REQ-DIAGRAM-08)", () => {
    // §0 allowlist per REGRESSION_PLAN: ⚠️ (U+26A0 ± U+FE0F), ✅ (U+2705), ❌ (U+274C).
    const ALLOWED_EMOJI = new Set([
      "⚠", // ⚠ (without variation selector)
      "⚠️", // ⚠️ (with VS-16)
      "✅", // ✅
      "❌", // ❌
    ]);
    // Conservative emoji ranges — covers 🖥 ☁ which we know existed in
    // architecture.mmd. Second range extended to U+2B55 so common dingbats
    // like ⭐ (U+2B50) and ⭕ (U+2B55) that a contributor might paste into a
    // label are not silently allowed (WR-02 / Phase 270 review).
    const EMOJI_RE = /([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{2B55}])️?/gu;

    test.each(MMD_FILES)(
      "%s contains no emoji outside §0 allowlist",
      (file) => {
        const { content } = mmds.find((m) => m.file === file);
        const matches = content.match(EMOJI_RE) || [];
        const forbidden = matches.filter((m) => !ALLOWED_EMOJI.has(m));
        if (forbidden.length > 0) {
          throw new Error(
            `${file} contains non-allowlist emoji(s): ${forbidden.map((c) => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase()})`).join(", ")}. ` +
              `REGRESSION_PLAN §0 allows only ⚠️ ✅ ❌. Remove these glyphs.`,
          );
        }
        expect(forbidden).toEqual([]);
      },
    );

    // Regression: prior emoji range stopped at U+27BF and missed ⭐ (U+2B50).
    // Pin detection capability so a future range narrowing is caught.
    test("emoji detector catches ⭐ when present in a synthetic .mmd label", () => {
      const synthetic = 'node["⭐ test label"]';
      const matches = synthetic.match(EMOJI_RE) || [];
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});

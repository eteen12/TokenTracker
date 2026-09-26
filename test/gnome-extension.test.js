const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.resolve(
  __dirname,
  "..",
  "TokenTrackerLinux",
  "gnome-extension",
  "tokentracker@tokentracker.cc",
);

test("GNOME extension parses as an ES module", () => {
  // Piped through stdin so Node 20 (no module detection) still checks it as ESM.
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: fs.readFileSync(path.join(extensionDir, "extension.js")),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("GNOME extension metadata matches its directory and lists shell versions", () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(extensionDir, "metadata.json"), "utf8"));
  // GNOME only loads an extension whose uuid equals its directory name.
  assert.equal(metadata.uuid, path.basename(extensionDir));
  assert.ok(Array.isArray(metadata["shell-version"]) && metadata["shell-version"].length > 0);
  for (const version of metadata["shell-version"]) {
    assert.match(version, /^\d+$/);
  }
});

// extension.js imports gi:// modules, so load just the response validator
// (and the error class it throws) out of the source and run it for real.
function loadResponseValidator() {
  const source = fs.readFileSync(path.join(extensionDir, "extension.js"), "utf8");
  const cls = source.match(/^class ServerError extends Error \{\}$/m);
  const start = source.indexOf("function parseJsonObject(");
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(cls && start >= 0 && end > start, "parseJsonObject / ServerError not found");
  return new Function(`${cls[0]}\n${source.slice(start, end)}\nreturn { ServerError, parseJsonObject };`)();
}

test("GNOME extension treats unusable JSON bodies as server errors", () => {
  const { ServerError, parseJsonObject } = loadResponseValidator();
  // `null` used to throw outside the refresh's catch; `[]` rendered as 0 / $0.
  for (const body of ["null", "[]", "[{\"totals\":{}}]", "42", "\"ok\"", "true", "{not json"]) {
    assert.throws(() => parseJsonObject(body, "/functions/x"), ServerError, body);
  }
  assert.deepEqual(parseJsonObject('{"totals":{"total_tokens":5}}', "/functions/x"), {
    totals: { total_tokens: 5 },
  });
});

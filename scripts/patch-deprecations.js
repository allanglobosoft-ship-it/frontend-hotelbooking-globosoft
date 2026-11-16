#!/usr/bin/env node
/**
 * Patches known deprecated-API usages inside third-party packages under
 * node_modules, without changing any behavior. Runs automatically after
 * every `npm install` (see package.json's "postinstall" script) because a
 * plain node_modules edit is otherwise wiped out on the next install.
 *
 * Currently patches:
 *   - http-proxy@1.18.1 (pulled in by react-scripts -> webpack-dev-server
 *     -> http-proxy-middleware, to implement package.json's "proxy" field
 *     for the CRA dev server). Its lib/http-proxy/{common,index}.js import
 *     `util._extend`, which Node 20+ flags with:
 *       (node:...) [DEP0060] DeprecationWarning: The `util._extend` API is
 *       deprecated. Please use Object.assign() instead.
 *     http-proxy has not published a fix (1.18.1 is still the latest
 *     release on npm as of this writing), so there is no newer version to
 *     upgrade to. `util._extend(target, source)` and `Object.assign(target,
 *     source)` are equivalent for the plain two-argument shallow-merge
 *     calls http-proxy makes here, which is exactly the replacement Node's
 *     own deprecation message recommends - so this changes zero behavior,
 *     it only silences the warning at its actual source instead of hiding
 *     it with --no-deprecation or downgrading Node.
 *
 * Idempotent: safe to run on every install - skips a file that is already
 * patched (or missing, e.g. a future react-scripts upgrade that drops this
 * transitive dependency entirely) instead of erroring.
 */
const fs = require("fs");
const path = require("path");

const PATCHES = [
  {
    file: path.join(__dirname, "..", "node_modules", "http-proxy", "lib", "http-proxy", "common.js"),
    from: "extend   = require('util')._extend,",
    to: "extend   = Object.assign,",
  },
  {
    file: path.join(__dirname, "..", "node_modules", "http-proxy", "lib", "http-proxy", "index.js"),
    from: "extend    = require('util')._extend,",
    to: "extend    = Object.assign,",
  },
];

for (const { file, from, to } of PATCHES) {
  if (!fs.existsSync(file)) {
    // Dependency not installed (different lockfile resolution, or a future
    // react-scripts version that no longer pulls in http-proxy) - nothing
    // to patch, not an error.
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(to)) {
    continue; // already patched
  }
  if (!text.includes(from)) {
    // Installed version's source no longer matches what we expect (a
    // version bump changed this line) - skip rather than corrupt the file.
    console.warn(`[patch-deprecations] Skipping ${file}: expected line not found (dependency version may have changed).`);
    continue;
  }
  fs.writeFileSync(file, text.replace(from, to), "utf8");
  console.log(`[patch-deprecations] Patched ${path.relative(process.cwd(), file)} (util._extend -> Object.assign).`);
}

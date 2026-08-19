// @ts-check
/**
 * Phase 0, task 7: measure the corp API RAM cost per function.
 * Output drives the daemon / worker script split.
 *
 * Usage: run tools/ram-costs.js
 *        run tools/ram-costs.js corporation formulas singularity
 */

/** @param {import(".").NS} ns */
export async function main(ns) {
  const namespaces = ns.args.length ? ns.args.map(String) : ["corporation"];
  const lines = [];

  lines.push(`home maxRam : ${ns.getServerMaxRam("home")} GB`);
  lines.push(`base script : ${ns.getScriptRam("tools/ram-costs.js", "home")} GB (this script)`);
  lines.push("");

  for (const nsName of namespaces) {
    const obj = /** @type {any} */ (ns)[nsName];
    if (!obj) { lines.push(`-- ${nsName}: not present --`); continue; }

    const rows = [];
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] !== "function") continue;
      let gb;
      try { gb = ns.getFunctionRamCost(`${nsName}.${key}`); }
      catch (e) { gb = NaN; }
      rows.push({ fn: `${nsName}.${key}`, gb });
    }
    rows.sort((a, b) => (b.gb || 0) - (a.gb || 0));

    const total = rows.reduce((s, r) => s + (r.gb || 0), 0);
    const distinct = [...new Set(rows.map((r) => r.gb))].sort((a, b) => b - a);

    lines.push(`== ${nsName} : ${rows.length} functions ==`);
    lines.push(`   naive total if one script used ALL of them: ${total.toFixed(2)} GB`);
    lines.push(`   distinct cost tiers: ${distinct.join(", ")}`);
    lines.push("");
    for (const r of rows) {
      lines.push(`   ${String(r.gb).padStart(7)}  ${r.fn}`);
    }
    lines.push("");
  }

  const out = lines.join("\n");
  ns.tprint("\n" + out);
  await ns.write("/logs/ram-costs.txt", out, "w");
  ns.tprint("\nwritten to /logs/ram-costs.txt");
}

// Vérifications du projet, lancées par la CI (et en local avec : node .github/scripts/check.mjs).
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

let errors = 0;
const ok = (msg) => console.log("✓ " + msg);
const fail = (msg) => { console.error("✗ " + msg); errors++; };
const read = (p) => readFileSync(p, "utf8");

// 1. Syntaxe JavaScript (front et script Google)
for (const file of ["assets/js/config.js", "assets/js/app.js", "apps-script/Code.gs"]) {
  try { new vm.Script(read(file), { filename: file }); ok(`syntaxe JavaScript valide : ${file}`); }
  catch (e) { fail(`erreur de syntaxe dans ${file} : ${e.message}`); }
}

// 2. Configuration du front
const sandbox = { window: {} };
vm.runInNewContext(read("assets/js/config.js"), sandbox);
const cfg = sandbox.window.PSM_CONFIG;
if (!cfg) fail("config.js ne définit pas window.PSM_CONFIG");
else {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(cfg.API_URL)) fail("API_URL doit être l'URL /exec du script Google");
  else ok("API_URL renseignée");
  if (isNaN(new Date(cfg.DEADLINE))) fail("DEADLINE n'est pas une date valide"); else ok(`date de clôture : ${cfg.DEADLINE}`);
  const todo = Object.entries(cfg.RGPD || {}).filter(([, v]) => !v || /À compléter/.test(v)).map(([k]) => k);
  if (todo.length) fail(`informations RGPD à compléter : ${todo.join(", ")}`); else ok("informations RGPD complètes");
}

// 3. Cohérence entre le front et le script Google
const gs = read("apps-script/Code.gs");
const gsValue = (name) => {
  const m = gs.match(new RegExp(`${name}:\\s*("?)([^",\\n]+)\\1`));
  return m ? m[2].trim() : undefined;
};
for (const k of ["MAX_VISUAL_MB", "MAX_VISUALS_PER_PROJECT", "MAX_REPORT_MB", "MAX_PROJECTS", "DEADLINE"]) {
  const front = String(cfg?.[k]);
  const back = gsValue(k);
  if (front !== back) fail(`${k} diffère : config.js = ${front}, Code.gs = ${back}`);
  else ok(`${k} identique dans config.js et Code.gs (${front})`);
}

// 4. Aucun secret dans le dépôt public
const key = gs.match(/EXPORT_KEY:\s*"([^"]*)"/);
if (key && key[1]) fail("EXPORT_KEY est écrite dans Code.gs : ce fichier est public, réglez-la dans les propriétés du script Google");
else ok("pas de clé secrète dans Code.gs");

// 5. Fichiers référencés par la page
const html = read("index.html");
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((p) => !p.startsWith("//"));
const optional = ["assets/img/logo-25ans.png"];
for (const ref of new Set(refs)) {
  if (existsSync(ref)) ok(`fichier présent : ${ref}`);
  else if (optional.includes(ref)) console.log(`• fichier facultatif absent : ${ref}`);
  else fail(`fichier manquant : ${ref}`);
}

if (errors) { console.error(`\n${errors} problème(s) détecté(s).`); process.exit(1); }
console.log("\nToutes les vérifications sont passées.");

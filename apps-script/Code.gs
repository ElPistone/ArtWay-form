/**
 * Back-end du formulaire « Collecte de projets & trombinoscope – 25 ans du Master PSM ».
 *
 * Ce script est lié au Google Sheet « PSM 25 ans » (Extensions > Apps Script).
 * - Les réponses sont écrites dans les onglets « Réponses » et « Projets ».
 * - Les fichiers (rapports PDF, visuels) sont rangés dans un dossier Google Drive, un sous-dossier par personne.
 * - Les photos du trombinoscope sont fournies par l'établissement : elles ne sont pas collectées ici.
 * - Un e-mail de confirmation est envoyé au répondant, et une notification à l'organisateur.
 * - Les données publiées sont exposées en JSON pour l'application AR (doGet ?action=export&key=…).
 *
 * Voir docs/DEPLOIEMENT.md pour l'installation.
 */

/* ========================= CONFIGURATION ========================= */

const CONFIG = {
  // Adresse qui reçoit une notification à chaque nouvelle réponse (laisser vide pour désactiver).
  NOTIFY_EMAIL: "diandiaby055@gmail.com",
  // Clé secrète de l'export JSON : ne l'écrivez pas ici (ce fichier est public sur GitHub).
  // Elle se règle dans Apps Script > Paramètres du projet > Propriétés du script, sous le nom EXPORT_KEY.
  EXPORT_KEY: "",
  // Date de clôture (heure de Paris).
  DEADLINE: "2026-11-10T23:59:59+01:00",
  // Nom du dossier Google Drive créé par setup().
  ROOT_FOLDER_NAME: "PSM 25 ans",
  // Limites (doivent correspondre à assets/js/config.js).
  MAX_VISUAL_MB: 5,
  MAX_VISUALS_PER_PROJECT: 5,
  MAX_REPORT_MB: 20,
  MAX_PROJECTS: 10,
  // Contact affiché dans l'e-mail de confirmation.
  CONTACT: "mamadou_dian.diaby@edu.univ-fcomte.fr"
};

const SHEET_REPONSES = "Réponses";
const SHEET_PROJETS = "Projets";
const HEADERS_REPONSES = [
  "Date d'envoi", "ID", "E-mail", "Nom", "Prénom", "Promotion", "Niveau",
  "LinkedIn", "Portfolio", "Poste actuel", "Entreprise",
  "Nb projets", "Autorisations", "Dossier Drive", "Publier (OUI/NON)", "Projets (JSON)"
];
const HEADERS_PROJETS = [
  "Date d'envoi", "ID réponse", "Nom", "Prénom", "N°", "Titre", "Type", "Année de réalisation",
  "Résumé", "Co-auteurs", "Lien", "Rapport PDF", "Visuels"
];
const REQUIRED_AUTHS = ["image", "exposition", "droits", "conservation", "archives", "rgpd"];
const MIME = {
  visuel: ["image/jpeg", "image/png", "image/webp"],
  rapport: ["application/pdf"]
};

/* ========================= INSTALLATION ========================= */

/** À exécuter une fois depuis l'éditeur : crée les onglets et le dossier Drive. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[SHEET_REPONSES, HEADERS_REPONSES], [SHEET_PROJETS, HEADERS_PROJETS]].forEach(([name, headers]) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  rootFolder_();
  Logger.log("Installation terminée. Dossier Drive : " + rootFolder_().getUrl());
}

/* ========================= POINTS D'ENTRÉE ========================= */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case "check": return json_(handleCheck_(body));
      case "upload": return json_(handleUpload_(body));
      case "submit": return json_(handleSubmit_(body));
      default: return json_({ ok: false, error: "Action inconnue." });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "Erreur serveur : " + err.message });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "export") {
    const key = PropertiesService.getScriptProperties().getProperty("EXPORT_KEY") || CONFIG.EXPORT_KEY;
    if (!key || p.key !== key) return json_({ ok: false, error: "Clé invalide." });
    return json_(exportJson_());
  }
  return json_({ ok: true, service: "PSM 25 ans – collecte", closed: isClosed_() });
}

/* ========================= ACTIONS ========================= */

function handleCheck_(body) {
  const email = normEmail_(body.email);
  return { ok: true, closed: isClosed_(), exists: !!email && emailExists_(email) };
}

function handleUpload_(body) {
  if (isClosed_()) return { ok: false, error: "Le formulaire est clos." };
  const email = normEmail_(body.email);
  if (!isEmail_(email)) return { ok: false, error: "E-mail invalide." };
  if (emailExists_(email)) return { ok: false, error: "Une réponse a déjà été envoyée avec cette adresse e-mail." };

  const id = String(body.submissionId || "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return { ok: false, error: "Identifiant d'envoi invalide." };

  const kind = body.kind;
  if (!MIME[kind] || MIME[kind].indexOf(body.mimeType) === -1) return { ok: false, error: "Type de fichier non accepté." };

  const maxMb = { visuel: CONFIG.MAX_VISUAL_MB, rapport: CONFIG.MAX_REPORT_MB }[kind];
  const bytes = Utilities.base64Decode(String(body.data || ""));
  if (!bytes.length) return { ok: false, error: "Fichier vide." };
  if (bytes.length > maxMb * 1024 * 1024) return { ok: false, error: "Fichier trop volumineux (max " + maxMb + " Mo)." };

  const folder = pendingFolder_(id, true);
  const maxFiles = CONFIG.MAX_PROJECTS * (1 + CONFIG.MAX_VISUALS_PER_PROJECT);
  if (countFiles_(folder) >= maxFiles) return { ok: false, error: "Trop de fichiers pour un seul envoi." };

  const prefix = "projet" + (Number(body.project) + 1) + "_" + kind;
  const name = prefix + "_" + safeName_(body.name);
  const file = folder.createFile(Utilities.newBlob(bytes, body.mimeType, name));
  return { ok: true, id: file.getId() };
}

function handleSubmit_(body) {
  // Anti-spam : champ caché rempli ou envoi trop rapide = robot. On répond « ok » sans rien enregistrer.
  if (body.website || Number(body.elapsedMs) < 5000) return { ok: true };
  if (isClosed_()) return { ok: false, error: "Le formulaire est clos." };

  const d = body.data || {};
  const err = validateSubmission_(d);
  if (err) return { ok: false, error: err };

  const id = String(body.submissionId || "");
  // Sans aucun fichier joint (projets décrits par un résumé), le dossier n'existe pas encore : on le crée.
  const hasFiles = d.projets.some((p) => p.rapport || (p.visuels || []).length);
  const folder = pendingFolder_(id, !hasFiles);
  if (!folder) return { ok: false, error: "Fichiers introuvables. Merci de recommencer l'envoi." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const email = normEmail_(d.email);
    if (emailExists_(email)) return { ok: false, error: "Une réponse a déjà été envoyée avec cette adresse e-mail. Il n'est pas possible de répondre une seconde fois." };

    // Vérifie que chaque fichier référencé appartient bien à cet envoi
    const ownIds = {};
    const it = folder.getFiles();
    while (it.hasNext()) ownIds[it.next().getId()] = true;
    const fileIds = [];
    d.projets.forEach((p) => {
      if (p.rapport) fileIds.push(p.rapport.id);
      (p.visuels || []).forEach((v) => fileIds.push(v.id));
    });
    if (fileIds.some((fid) => !ownIds[fid])) return { ok: false, error: "Fichier non reconnu. Merci de recommencer l'envoi." };

    // Range le dossier et rend les fichiers lisibles par lien (pour l'application AR)
    folder.setName(safeName_(d.nom.toUpperCase() + " " + d.prenom) + " – " + id.slice(0, 8));
    folder.moveTo(rootFolder_());
    const files = folder.getFiles();
    while (files.hasNext()) files.next().setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const now = new Date();
    const projets = d.projets.map((p, i) => ({
      numero: i + 1,
      titre: p.titre, type: p.type, annee: p.annee || "", resume: p.resume || "",
      equipe: p.equipe || "", lien: p.lien || "",
      rapport: p.rapport ? p.rapport.id : null,
      visuels: (p.visuels || []).map((v) => v.id)
    }));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheetByName(SHEET_REPONSES).appendRow([
      now, id, email, d.nom, d.prenom, d.annee, d.niveau,
      d.linkedin || "", d.portfolio || "", d.poste || "", d.entreprise || "",
      projets.length, d.autorisations.join(", "),
      folder.getUrl(), "OUI", JSON.stringify(projets)
    ].map(cell_));

    const shP = ss.getSheetByName(SHEET_PROJETS);
    projets.forEach((p) => shP.appendRow([
      now, id, d.nom, d.prenom, p.numero, p.titre, p.type, p.annee, p.resume, p.equipe, p.lien,
      p.rapport ? fileUrl_(p.rapport) : "", p.visuels.map(fileUrl_).join("\n")
    ].map(cell_)));

    SpreadsheetApp.flush();
    sendEmails_(d, projets, folder.getUrl());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function validateSubmission_(d) {
  const req = (v) => typeof v === "string" && v.trim().length > 0;
  if (!isEmail_(normEmail_(d.email))) return "E-mail invalide.";
  if (!req(d.nom) || !req(d.prenom)) return "Nom et prénom obligatoires.";
  if (!req(d.annee)) return "Année de promotion obligatoire.";
  if (["L3 PSM", "M1 PSM", "M2 PSM"].indexOf(d.niveau) === -1) return "Niveau invalide.";
  if (!Array.isArray(d.projets) || d.projets.length < 1) return "Au moins un projet est obligatoire.";
  if (d.projets.length > CONFIG.MAX_PROJECTS) return "Trop de projets.";
  for (const p of d.projets) {
    if (!req(p.titre) || !req(p.type)) return "Chaque projet doit avoir un titre et un type.";
    if (!p.rapport && (!p.resume || p.resume.trim().length < 50)) return "Chaque projet doit avoir un rapport PDF ou un résumé.";
    if ((p.visuels || []).length > CONFIG.MAX_VISUALS_PER_PROJECT) return "Trop de visuels.";
  }
  const auths = d.autorisations || [];
  if (REQUIRED_AUTHS.some((a) => auths.indexOf(a) === -1)) return "Toutes les autorisations sont nécessaires.";
  return "";
}

/* ========================= E-MAILS ========================= */

function sendEmails_(d, projets, folderUrl) {
  const titres = projets.map((p) => "• " + p.titre + " (" + p.type + ")").join("\n");
  try {
    MailApp.sendEmail({
      to: normEmail_(d.email),
      subject: "Confirmation – 25 ans du Master PSM",
      body:
        "Bonjour " + d.prenom + ",\n\n" +
        "Nous avons bien reçu votre participation au trombinoscope et à l'exposition virtuelle des 25 ans du Master PSM. Merci !\n\n" +
        "Récapitulatif :\n" +
        "Promotion : " + d.annee + " – " + d.niveau + "\n" +
        "Projets :\n" + titres + "\n\n" +
        "Pour toute modification ou demande de suppression de vos données, écrivez à : " + CONFIG.CONTACT + "\n\n" +
        "L'équipe du projet SAE M1 PSM",
      name: "Master PSM – 25 ans"
    });
  } catch (err) { console.error("Confirmation non envoyée : " + err); }

  if (!CONFIG.NOTIFY_EMAIL || CONFIG.NOTIFY_EMAIL.indexOf("@") === -1) return;
  try {
    MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL,
      subject: "[PSM 25 ans] Nouvelle réponse : " + d.prenom + " " + d.nom,
      body:
        d.prenom + " " + d.nom + " (" + normEmail_(d.email) + ")\n" +
        "Promotion : " + d.annee + " – " + d.niveau + "\n" +
        "Projets :\n" + titres + "\n\n" +
        "Fichiers : " + folderUrl + "\n" +
        "Tableur : " + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    });
  } catch (err) { console.error("Notification non envoyée : " + err); }
}

/* ========================= EXPORT JSON ========================= */

/** Export des réponses dont la colonne « Publier » vaut OUI. L'e-mail n'est jamais exporté. */
function exportJson_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REPONSES);
  const values = sh.getDataRange().getValues();
  const h = values.shift();
  const col = (name) => h.indexOf(name);
  const items = values
    .filter((r) => String(r[col("Publier (OUI/NON)")]).trim().toUpperCase() === "OUI")
    .map((r) => {
      const projets = JSON.parse(r[col("Projets (JSON)")] || "[]");
      return {
        id: r[col("ID")],
        dateEnvoi: r[col("Date d'envoi")],
        nom: r[col("Nom")],
        prenom: r[col("Prénom")],
        promotion: r[col("Promotion")],
        niveau: r[col("Niveau")],
        linkedin: r[col("LinkedIn")],
        portfolio: r[col("Portfolio")],
        poste: r[col("Poste actuel")],
        entreprise: r[col("Entreprise")],
        projets: projets.map((p) => ({
          numero: p.numero, titre: p.titre, type: p.type, annee: p.annee,
          resume: p.resume, equipe: p.equipe, lien: p.lien,
          rapport: p.rapport ? fileInfo_(p.rapport) : null,
          visuels: p.visuels.map(fileInfo_)
        }))
      };
    });
  return { ok: true, generatedAt: new Date(), count: items.length, items: items };
}

function fileInfo_(id) {
  if (!id) return null;
  return {
    id: id,
    image: "https://lh3.googleusercontent.com/d/" + id,
    download: "https://drive.google.com/uc?export=download&id=" + id,
    view: fileUrl_(id)
  };
}

/* ========================= MAINTENANCE ========================= */

/** Supprime les envois abandonnés (fichiers déposés sans validation finale) de plus de 24 h. */
function cleanupPending() {
  const pending = pendingRoot_();
  const limit = Date.now() - 24 * 3600 * 1000;
  const it = pending.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getLastUpdated().getTime() < limit) f.setTrashed(true);
  }
}

/* ========================= OUTILS ========================= */

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("ROOT_FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_) { /* recréé ci-dessous */ }
  }
  const folder = DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
  props.setProperty("ROOT_FOLDER_ID", folder.getId());
  return folder;
}

function pendingRoot_() {
  const root = rootFolder_();
  const it = root.getFoldersByName("_envois_en_cours");
  return it.hasNext() ? it.next() : root.createFolder("_envois_en_cours");
}

function pendingFolder_(id, create) {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return null;
  const parent = pendingRoot_();
  const it = parent.getFoldersByName(id);
  if (it.hasNext()) return it.next();
  return create ? parent.createFolder(id) : null;
}

function countFiles_(folder) {
  let n = 0;
  const it = folder.getFiles();
  while (it.hasNext()) { it.next(); n++; }
  return n;
}

function emailExists_(email) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REPONSES);
  if (sh.getLastRow() < 2) return false;
  return !!sh.getRange(2, 3, sh.getLastRow() - 1, 1)
    .createTextFinder(email).matchEntireCell(true).matchCase(false).findNext();
}

function isClosed_() { return Date.now() > new Date(CONFIG.DEADLINE).getTime(); }
function normEmail_(v) { return String(v || "").trim().toLowerCase(); }
function isEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function safeName_(v) { return String(v || "fichier").replace(/[\\/:*?"<>|#%]+/g, "_").slice(0, 120); }
function fileUrl_(id) { return "https://drive.google.com/file/d/" + id + "/view"; }

/** Empêche l'injection de formules dans le tableur. */
function cell_(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/*
 * Configuration du formulaire.
 * C'est le seul fichier à modifier après le déploiement du script Google.
 */
window.PSM_CONFIG = {
  // URL de l'application Web Google Apps Script (se termine par /exec).
  // Voir docs/DEPLOIEMENT.md, étape 3.
  API_URL: "https://script.google.com/macros/s/AKfycbyVxHMUe8CuXhwDoSgyBh2DYKcVBpOxFV9L0wplJ24kft8Yc8Rw_4I-M4ZT-JsQAZUulA/exec",

  // Date et heure de clôture (heure de Paris). Le script Google vérifie aussi cette date.
  DEADLINE: "2026-11-10T23:59:59+01:00",

  // Premier millésime proposé dans la liste des promotions (création du Master PSM).
  FIRST_YEAR: 2001,
  // Dernière année de début de promotion proposée (2026 = promotion 2026-2027).
  LAST_YEAR: 2026,

  // Limites des fichiers (en Mo). Doivent correspondre à celles de apps-script/Code.gs.
  MAX_VISUAL_MB: 5,
  MAX_VISUALS_PER_PROJECT: 5,
  MAX_REPORT_MB: 20,
  MAX_PROJECTS: 10,

  // Informations RGPD affichées en bas du formulaire.
  RGPD: {
    responsable: "Ahmed Mostefaoui et Marc Bertin, équipe pédagogique du Master PSM",
    organisme: "Université Marie et Louis Pasteur – Master PSM",
    contact: "mamadou_dian.diaby@edu.univ-fcomte.fr",
    conservation: "5 ans à compter de l'envoi du formulaire, puis suppression",
    dpo: "Ahmed Mostefaoui et Marc Bertin, équipe pédagogique du Master PSM"
  }
};

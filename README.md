# Collecte d'infos d'anciens étudiants – 25 ans du Master PSM

Formulaire web de collecte des données des anciens étudiants du Master PSM (Université Marie et Louis Pasteur), réalisé dans le cadre du projet SAE M1 PSM. Les données alimentent une application mobile en réalité augmentée : un trombinoscope interactif et une exposition virtuelle des travaux de la formation.

## Fonctionnement

```
GitHub Pages (index.html)  ──►  Google Apps Script  ──►  Google Sheets (réponses)
                                                    └─►  Google Drive (visuels, rapports PDF)
                                                    └─►  E-mails (confirmation + notification)
Application AR  ◄── JSON (export protégé par clé) ──┘
```

- **Front** : HTML, CSS et JavaScript sans dépendance, hébergé gratuitement sur GitHub Pages.
- **Back-end** : un script Google Apps Script lié à un Google Sheet, gratuit.
- **Fichiers** : envoyés un par un vers Google Drive, puis rangés dans un dossier par personne.

## Contenu du formulaire

Le formulaire se remplit en 5 étapes (bouton « Suivant », indicateur de progression, vérification à chaque étape) :

1. **Identité** : e-mail, nom, prénom.
2. **Parcours** : année de promotion puis niveau (L3, M1, M2), LinkedIn, portfolio, poste et entreprise actuels.
3. **Projets** : autant que souhaité (10 max). Pour chacun : titre, type, année, rapport PDF (20 Mo max) ou résumé, jusqu'à 5 visuels (5 Mo chacun), co-auteurs et lien.
4. **Autorisations** : droit à l'image, diffusion des projets, garantie des droits, conservation, réutilisation des archives, consentement RGPD.
5. **Récapitulatif** : relecture complète, avec un bouton « Modifier » par partie, avant l'envoi.

Les photos du trombinoscope sont fournies par l'établissement : le formulaire ne les demande pas. L'application AR les associe aux réponses grâce au nom, au prénom et à la promotion.

Règles :
- une seule réponse par adresse e-mail (vérifiée côté serveur) ;
- clôture automatique le 10 novembre 2026 à 23 h 59 ;
- anti-spam invisible (champ piège et délai minimal).

## Structure

```
index.html              Page du formulaire
assets/css/style.css    Styles (couleurs PSM : variables --brand et --accent)
assets/js/config.js     Configuration : URL du script, date limite, limites, textes RGPD
assets/js/app.js        Logique du formulaire
assets/img/             Logos (logo-psm.png, logo-25ans.png facultatif)
apps-script/Code.gs     Script Google à coller dans le Google Sheet
docs/DEPLOIEMENT.md     Guide d'installation pas à pas
.github/                CI : vérifications et déploiement sur GitHub Pages
```

## Intégration continue

À chaque push sur `main` (et sur chaque pull request), le workflow `.github/workflows/ci.yml` :

1. vérifie la syntaxe JavaScript, la configuration (URL du script, date, RGPD), la cohérence des limites entre `config.js` et `Code.gs`, l'absence de clé secrète dans le dépôt et la présence des fichiers utilisés par la page ;
2. valide le HTML ;
3. si tout est bon, publie le site sur GitHub Pages (seulement `index.html` et `assets/`).

Les vérifications se lancent aussi en local : `node .github/scripts/check.mjs`.

## Installation

Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Export pour l'application AR

```
GET <URL_DU_SCRIPT>?action=export&key=<EXPORT_KEY>
```

La clé `EXPORT_KEY` se règle dans les propriétés du script Google, jamais dans le dépôt.

Renvoie les réponses dont la colonne « Publier » vaut `OUI`, sans les adresses e-mail. Chaque fichier est fourni avec un lien image direct, un lien de téléchargement et un lien de consultation.

## Données personnelles

Les données sont réservées à un usage pédagogique, culturel et non commercial. Les informations RGPD (responsable, contact, durée de conservation) sont affichées sur le formulaire et se règlent dans `assets/js/config.js`.

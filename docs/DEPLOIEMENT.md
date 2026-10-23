# Guide de déploiement

Comptez environ 15 minutes. Il vous faut un compte Google (de préférence un compte Gmail personnel ou dédié au projet : certains comptes universitaires bloquent le partage par lien) et votre compte GitHub.

## 1. Créer le Google Sheet et le script

1. Ouvrez votre feuille Google Sheets **PSM 25 ans** (créez-la sur [sheets.google.com](https://sheets.google.com) si besoin).
2. Menu **Extensions > Apps Script**.
3. Supprimez le contenu du fichier `Code.gs` et collez celui de `apps-script/Code.gs`.
4. En haut du fichier, dans `CONFIG`, remplissez :
   - `NOTIFY_EMAIL` : déjà réglé sur diandiaby055@gmail.com, pour être notifié de chaque réponse ;
   - `CONTACT` : l'adresse de contact affichée dans l'e-mail de confirmation.
5. Enregistrez (icône disquette).

## 2. Initialiser

1. Dans la liste des fonctions en haut, choisissez **setup** puis cliquez sur **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations**, choisissez votre compte, puis **Paramètres avancés > Accéder au projet (non sécurisé)** et **Autoriser**. C'est normal pour un script personnel.
3. Le journal affiche le lien du dossier Drive créé. Les onglets **Réponses** et **Projets** apparaissent dans la feuille.

> Si vous aviez déjà exécuté une ancienne version du script, supprimez les onglets **Réponses** et **Projets** avant de relancer `setup` : les colonnes ont changé (la colonne « Photo » n'existe plus).

4. Réglez la clé secrète de l'export JSON : icône **Paramètres du projet** (roue dentée à gauche) > **Propriétés du script** > **Ajouter une propriété**. Nom : `EXPORT_KEY`, valeur : une longue phrase secrète. Ne l'écrivez jamais dans `Code.gs` : ce fichier est public sur GitHub.

## 3. Déployer l'application Web

1. Bouton **Déployer > Nouveau déploiement**.
2. Type (roue dentée) : **Application Web**.
3. **Exécuter en tant que** : *Moi*. **Qui a accès** : *Tout le monde*.
4. **Déployer**, puis copiez l'**URL de l'application Web** (elle se termine par `/exec`).

> Si vous modifiez le script plus tard : **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer**. L'URL reste la même.

## 4. (Facultatif) Nettoyage automatique

Si quelqu'un abandonne en cours d'envoi, ses fichiers restent dans `_envois_en_cours`. Pour les supprimer chaque nuit : menu **Déclencheurs** (icône horloge) > **Ajouter un déclencheur** > fonction `cleanupPending`, source *Basé sur le temps*, *Minuteur quotidien*.

## 5. Configurer le site

Dans `assets/js/config.js` :
- `API_URL` : collez l'URL copiée à l'étape 3 ;
- `RGPD` : complétez le responsable, le contact, la durée de conservation et le contact DPO de l'université.

Ajoutez vos logos dans `assets/img/` sous les noms `logo-psm.png` et `logo-25ans.png` (s'ils sont absents, ils sont simplement masqués). Pour adapter la couleur principale, modifiez `--accent` et `--accent-dark` dans `assets/css/style.css`.

## 6. Publier sur GitHub Pages

1. Créez le dépôt sur GitHub (public) et envoyez-y tous les fichiers (le `.gitignore` écarte les fichiers inutiles).
2. **Settings > Pages > Build and deployment** : Source **GitHub Actions**.
3. Chaque push sur `main` lance le workflow **CI** (onglet **Actions**) : il vérifie le projet puis publie le site. Si une vérification échoue, le site n'est pas mis à jour et le journal indique quoi corriger.
4. Le site est disponible à `https://elpistone.github.io/<nom-du-depot>/`.

## 7. Tester

1. Remplissez le formulaire avec votre propre adresse.
2. Vérifiez : une ligne dans **Réponses**, une ou plusieurs dans **Projets**, un dossier à votre nom dans Drive (dossier vide si vous n'avez joint aucun fichier), l'e-mail de confirmation et la notification.
3. Renvoyez avec la même adresse : l'envoi doit être refusé.
4. Supprimez ensuite votre ligne de test dans les deux onglets (et le dossier Drive) pour pouvoir répondre « pour de vrai ».

## Export JSON pour l'application AR

```
https://script.google.com/macros/s/.../exec?action=export&key=VOTRE_EXPORT_KEY
```

Seules les lignes avec **Publier = OUI** sont exportées : mettez `NON` pour masquer une personne (retrait du consentement, contenu à vérifier…). Les adresses e-mail ne sont jamais exportées.

## Limites à connaître (comptes Google gratuits)

- **E-mails** : environ 100 envois par jour avec un compte Gmail, soit environ 50 réponses par jour (confirmation + notification). Au-delà, la réponse est quand même enregistrée, seul l'e-mail n'est pas envoyé.
- **Stockage** : 15 Go partagés entre Gmail, Drive et Photos.
- **Durée** : chaque requête est limitée à 6 minutes, ce qui est largement suffisant puisque les fichiers sont envoyés un par un.

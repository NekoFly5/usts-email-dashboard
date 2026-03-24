# Rapport de Mission — Dashboard Email & Automatisation n8n

## Contexte

Ce projet a pour objectif de développer une interface web affichant un récapitulatif des emails reçus dans la journée, couplée à un workflow d'automatisation n8n capable de récupérer, traiter et résumer ces emails via une IA.

---

## Partie 1 — Interface Web

### Architecture choisie

L'interface est développée en **HTML/CSS/JavaScript vanilla**, sans framework, pour rester simple et déployable statiquement sur GitHub Pages.

**Structure des fichiers :**
```
projet/
├── index.html        # Structure de la page
├── style.css         # Styles et animations
├── app.js            # Logique applicative
└── mailstoday.json   # Données de démonstration
```

**Fonctionnalités implémentées :**
- Connexion Gmail via OAuth2 (Google Identity Services)
- Récupération des emails du jour via l'API Gmail v1
- Affichage : expéditeur, objet, date/heure, extrait
- Résumé du jour généré à partir des sujets et extraits des emails (affichage bullet par email)
- Fallback sur le résumé Groq de `mailstoday.json` quand disponible (mode n8n)
- Filtres par expéditeur (chips cliquables)
- Tri par date, expéditeur ou objet
- Vues : "Aujourd'hui" / "Tous les mails" (7 jours)
- Panneau de détail avec corps de l'email
- Sidebar rétractable avec profil utilisateur
- Interface responsive (mobile/desktop)
- Thème sombre

**Authentification :**

L'authentification utilise le flux OAuth2 par token de Google Identity Services (GIS). Le token est stocké en `sessionStorage` avec sa date d'expiration pour éviter une reconnexion à chaque rechargement de page.

### Étapes d'installation

1. Créer un projet sur [Google Cloud Console](https://console.cloud.google.com)
2. Activer l'**API Gmail**
3. Créer un **ID client OAuth2** (Application Web)
4. Ajouter les origines autorisées :
   - `http://localhost:5500`
   - `https://nekofly5.github.io`
5. Configurer l'écran de consentement OAuth (scopes : `gmail.readonly`, `userinfo.profile`, `userinfo.email`)
6. Renseigner le Client ID dans `app.js` :
   ```js
   const GMAIL_CLIENT_ID = 'VOTRE_CLIENT_ID.apps.googleusercontent.com';
   ```
7. Déployer sur GitHub Pages ou ouvrir avec un serveur local (ex: Live Server)

### Difficultés rencontrées

| Problème | Cause | Solution |
|----------|-------|----------|
| Erreurs 429 (Too Many Requests) | Trop de requêtes parallèles à l'API Gmail | Passage à `format=metadata` pour la liste, chargement du corps uniquement au clic, traitement par lots de 3 avec délai de 500ms |
| Double connexion requise | `select_account` ne déclenche pas l'écran de consentement Gmail | Utilisation de `prompt: 'consent'` dès le premier clic |
| Caractères accentués corrompus (é → Ã©) | `atob()` ne gère pas l'UTF-8 | Décodage via `TextDecoder('utf-8')` sur un `Uint8Array` |
| Session perdue au rechargement (F5) | GIS ne propose pas de rafraîchissement silencieux | Sauvegarde du token dans `sessionStorage` avec vérification de l'expiration |
| Sidebar visible derrière l'écran de connexion | `z-index` insuffisant | `position: fixed; inset: 0; z-index: 200` sur l'écran d'auth |
| Dates incorrectes | Le header `Date` des emails est parfois malformé | Utilisation de `internalDate` (timestamp fiable fourni par l'API Gmail) |
| Boucle infinie 403 | `requestAccessToken({prompt:'consent'})` redéclenche un 403 en boucle | Flag `_consentAttempted` pour ne tenter le consentement qu'une seule fois |
| Résumé trop vague ("6 emails de 2 expéditeurs") | `autoSummary` ne lisait que les métadonnées statistiques | Réécriture pour afficher un bullet par email avec sujet, expéditeur et extrait |

---

## Partie 2 — Workflow n8n

### Architecture choisie

Le workflow est exécuté en **local** via n8n self-hosted (Docker). Il s'articule en 4 étapes :

```
[Démarrage manuel]  ──┐
                      ├──► [Gmail — emails du jour] ──► [Formater les emails] ──► [Résumé Groq + Sauvegarde JSON]
[Planification 8h]  ──┘
```

**Noeud 1 & 2 — Déclencheurs**
- Démarrage manuel (pour les tests)
- Planification automatique : tous les jours ouvrés à 8h (cron `0 8 * * 1-5`)

**Noeud 3 — Gmail**
- Opération : `Get Many`
- Filtre : `after:YYYY/MM/DD` (emails du jour uniquement)
- Credentials : OAuth2 Gmail

**Noeud 4 — Formater les emails**
- Code JavaScript qui extrait depuis la réponse Gmail brute :
  - Expéditeur (`from.text`)
  - Objet (`subject`)
  - Date (`internalDate` → ISO 8601)
  - Extrait (`snippet` ou `text`)

**Noeud 5 — Résumé Groq + Sauvegarde JSON**
- Appel à l'API **Groq** (modèle `llama-3.3-70b-versatile`) pour générer un résumé en français
- Sauvegarde du résultat dans `mailstoday.json` via le module Node.js `fs`

### Étapes d'installation

**Prérequis :** Docker Desktop installé et démarré.

1. Lancer n8n via Docker :
```bash
docker run -it --rm --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e NODE_FUNCTION_ALLOW_BUILTIN=fs,https \
  -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
  -e GROQ_API_KEY=VOTRE_CLÉ_GROQ \
  -e MAILSTODAY_PATH=/data/mailstoday.json \
  -v "/chemin/vers/projet:/data" \
  docker.n8n.io/n8nio/n8n
```

2. Ouvrir `http://localhost:5678` et créer un compte
3. Importer le fichier `n8n-workflow.json` (menu → Import)
4. Configurer les credentials Gmail OAuth2 dans le noeud Gmail (même Client ID et Secret que la partie web, avec l'URI de redirection `http://localhost:5678/rest/oauth2-credential/callback`)
5. Créer une clé API Groq gratuite sur [console.groq.com](https://console.groq.com) et la renseigner dans la variable d'environnement `GROQ_API_KEY`
6. Exécuter le workflow via le bouton "Execute workflow"

### Difficultés rencontrées

| Problème | Cause | Solution |
|----------|-------|----------|
| Module `fs` bloqué | n8n sandbox interdit les modules natifs par défaut | Variable d'env `NODE_FUNCTION_ALLOW_BUILTIN=fs,https` |
| `$env` inaccessible | Accès aux variables d'env bloqué dans les Code nodes | Variable d'env `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` |
| `fetch` indisponible | n8n sandbox ne dispose pas de `fetch` global | Utilisation du module `https` natif de Node.js |
| Champs `from`/`subject` vides | Le toggle "Simplify" du noeud Gmail masque les headers | Désactivation de "Simplify" pour obtenir la réponse Gmail brute |
| Installation npm échouée | Node.js v25 incompatible avec les modules natifs de n8n + Windows SDK manquant | Utilisation de Docker à la place de l'installation npm globale |

---

## Résultats obtenus

### Partie 1
- Interface web fonctionnelle déployée sur GitHub Pages
- Connexion Gmail OAuth2 opérationnelle
- Affichage des emails avec expéditeur, objet, date, extrait
- Tri, filtres par expéditeur, vues "Aujourd'hui" / "7 jours"
- Panneau de lecture avec chargement du corps à la demande
- Gestion des erreurs API (429, 403, 401) avec messages utilisateur
- Résumé détaillé par email (sujet, expéditeur, extrait) avec fallback sur résumé Groq
- Compte de démo pré-sélectionné via `login_hint` pour faciliter les tests recruteur

### Partie 2
- Workflow n8n fonctionnel en local
- Récupération automatique des emails Gmail du jour
- Résumé IA généré par Groq (LLaMA 3.3 70B) en français
- Sauvegarde dans `mailstoday.json` avec structure exploitable par l'interface web
- Planification automatique à 8h les jours ouvrés

---

## Technologies utilisées

| Technologie | Usage |
|-------------|-------|
| HTML / CSS / JavaScript | Interface web (vanilla, sans framework) |
| Gmail API v1 | Lecture des emails |
| Google Identity Services | Authentification OAuth2 navigateur |
| n8n (self-hosted, Docker) | Orchestration du workflow |
| Groq API — LLaMA 3.3 70B | Génération du résumé IA |
| GitHub Pages | Hébergement de l'interface web |
| Docker | Exécution de n8n en local |

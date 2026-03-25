# Rapport de Mission — Dashboard Email & Automatisation n8n

## Contexte

Ce projet a pour objectif de développer une interface web affichant un récapitulatif des emails reçus dans la journée, couplée à un workflow d'automatisation n8n capable de récupérer, traiter et résumer ces emails via une IA (Groq).

---

## Partie 1 — Interface Web

### Architecture choisie

L'interface est développée en **HTML/CSS/JavaScript vanilla**, sans framework, pour rester simple et déployable statiquement.

**Structure des fichiers :**
```
USTS/
├── index.html           # Structure de la page
├── style.css            # Styles et animations
├── app.js               # Logique applicative
├── mailstoday.json      # Données de démonstration (fallback)
├── nginx.conf           # Configuration serveur local
├── docker-compose.yml   # Orchestration Docker
├── n8n-workflow.json    # Export du workflow n8n
└── RAPPORT.md           # Ce rapport
```

**Fonctionnalités implémentées :**
- Chargement des emails depuis le webhook n8n (`http://localhost:5678/webhook/mailstoday`)
- Fallback automatique sur `mailstoday.json` si n8n n'est pas disponible
- Affichage : expéditeur, objet, date/heure, corps du message
- Résumé IA de la journée généré par Groq via n8n
- Filtres par expéditeur (chips cliquables)
- Tri par date, expéditeur ou objet
- Vues : "Aujourd'hui" / "Tous les mails" / "Importants" / "Archive" / "Corbeille"
- Panneau de détail avec corps complet de l'email
- Sidebar rétractable
- Interface responsive (mobile/desktop)
- Thème clair/sombre

### Étapes d'installation

**Prérequis :** Docker Desktop installé et démarré.

1. Cloner le projet :
```bash
git clone https://github.com/NekoFly5/usts-email-dashboard.git
cd usts-email-dashboard
```

2. Créer le fichier `.env` :
```
GROQ_API_KEY=votre_clé_groq
```

3. Lancer les services :
```bash
docker compose up
```

4. Ouvrir l'interface web : `http://localhost:8080`
5. Ouvrir n8n : `http://localhost:5678`

---

## Partie 2 — Workflow n8n

### Architecture choisie

Le workflow est exécuté en **local** via n8n self-hosted (Docker). Il s'articule en deux chaînes parallèles dans le même workflow :

**Chaîne principale (collecte + résumé) :**
```
[Démarrage manuel]      ──┐
                           ├──► [Gmail] ──► [Formater] ──► [Préparer Groq] ──► [HTTP Request Groq] ──► [Formater réponse] ──► [Respond to Webhook]
[Planification 8h]      ──┘
```

**Chaîne webhook (interface web) :**
```
[Webhook GET /mailstoday] ──► [même chaîne ci-dessus]
```

**Nœud 1 & 2 — Déclencheurs**
- Démarrage manuel (tests)
- Planification automatique : jours ouvrés à 8h (`0 8 * * 1-5`)
- Webhook GET `/mailstoday` : déclenché par l'interface web

**Nœud 3 — Gmail**
- Opération : `Get Many` (tous les messages)
- Filtre : `after:YYYY/MM/DD` (emails du jour uniquement)
- Credentials : OAuth2 Gmail

**Nœud 4 — Formater les emails**
- Extrait depuis la réponse Gmail brute : expéditeur, objet, date (`internalDate`), snippet, corps complet

**Nœud 5 — Préparer Groq**
- Construit le prompt à partir des emails
- Sauvegarde temporaire des emails dans la static data du workflow

**Nœud 6 — HTTP Request Groq**
- Appel à l'API **Groq** (modèle `llama-3.3-70b-versatile`)
- Génère un résumé en français en 3 à 5 bullet points

**Nœud 7 — Formater réponse**
- Récupère les emails depuis la static data
- Construit le JSON final : `generatedAt`, `date`, `summary`, `emails`

**Nœud 8 — Respond to Webhook**
- Retourne le JSON à l'interface web avec header CORS `Access-Control-Allow-Origin: *`

> **Note sur `mailstoday.json` :** Le sujet demandait de sauvegarder les données dans un fichier JSON local via un nœud "Write Binary File" ou "Write to Local File". Cette approche a été tentée mais s'est heurtée à deux blocages : (1) n8n 2.x interdit les modules natifs Node.js (`fs`, `https`) dans les Code nodes pour des raisons de sécurité, et (2) les restrictions d'accès fichier du nœud "Read/Write Files from Disk" bloquent l'écriture même avec les variables d'environnement adéquates sur Docker Desktop Windows. En lieu et place, l'architecture retenue expose un **webhook GET** (`/mailstoday`) qui renvoie le JSON directement à l'interface web — ce qui est fonctionnellement équivalent, sans dépendance au système de fichiers. Le fichier `mailstoday.json` présent dans le repo contient des données de démonstration utilisées en fallback si n8n n'est pas disponible.

### Étapes d'installation

**Prérequis :** Docker Desktop installé et démarré.

1. Lancer Docker :
```bash
docker compose up
```

2. Ouvrir n8n : `http://localhost:5678` → créer un compte

3. Importer le workflow : **Add workflow → Import from file** → `n8n-workflow.json`

4. Configurer les credentials Gmail OAuth2 :
   - Créer un projet sur [Google Cloud Console](https://console.cloud.google.com)
   - Activer l'API Gmail
   - Créer un ID client OAuth2 (Application Web)
   - Ajouter l'URI de redirection : `http://localhost:5678/rest/oauth2-credential/callback`
   - Ajouter le compte Gmail comme utilisateur test dans l'écran de consentement

5. Dans le nœud **"Appel Groq API"**, renseigner la clé API Groq dans le header `Authorization` :
   - Créer une clé gratuite sur [console.groq.com](https://console.groq.com)
   - Format : `Bearer votre_clé_groq`

6. **Publier** le workflow (bouton Publish en haut à droite)

7. Exécuter via **Démarrage manuel** pour tester

### Difficultés rencontrées

| Problème | Cause | Solution |
|----------|-------|----------|
| Module `fs` bloqué | n8n sandbox interdit les modules natifs | Remplacement par un nœud HTTP Request natif |
| Module `https` bloqué | n8n sandbox interdit aussi `https` | Utilisation du nœud HTTP Request de n8n |
| `$env` inaccessible dans Code nodes | Restriction de sécurité n8n | Clé directement dans le nœud HTTP Request |
| Variables n8n payantes | `$vars` nécessite un plan Enterprise | Clé renseignée manuellement dans le nœud |
| Fichier non accessible en écriture | Restrictions Docker bind mount + n8n sandbox | Architecture webhook : n8n répond directement à l'interface |
| Données non persistantes | Volumes Docker perdus au redémarrage | Bind mounts vers dossiers locaux (`./n8n_data`) |
| Installation npm échouée | Erreur `ECOMPROMISED` sur Windows | Utilisation de Docker à la place |

---

## Résultats obtenus

### Partie 1
- Interface web fonctionnelle accessible sur `http://localhost:8080`
- Chargement dynamique des emails depuis le webhook n8n
- Fallback sur `mailstoday.json` si n8n indisponible
- Affichage complet : expéditeur, objet, date, corps du message
- Filtres, tri, vues multiples, responsive, thème sombre

### Partie 2
- Workflow n8n fonctionnel en local via Docker
- Récupération automatique des emails Gmail du jour
- Résumé IA généré par Groq (LLaMA 3.3 70B) en français
- Webhook exposé pour l'interface web
- Planification automatique à 8h les jours ouvrés

---

## Technologies utilisées

| Technologie | Usage |
|-------------|-------|
| HTML / CSS / JavaScript | Interface web (vanilla, sans framework) |
| Gmail API v1 | Lecture des emails |
| n8n (self-hosted, Docker) | Orchestration du workflow |
| Groq API — LLaMA 3.3 70B | Génération du résumé IA |
| nginx (Docker) | Serveur HTTP local pour l'interface |
| Docker / docker-compose | Exécution locale de tous les services |

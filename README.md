# MailSummary — Dashboard Email Local

Interface web affichant le récapitulatif des emails du jour, alimentée par un workflow n8n + Groq IA.

---

## Lancement rapide

**Prérequis :** Docker Desktop installé et démarré.

### 1. Créer le fichier `.env`

```
GROQ_API_KEY=votre_clé_groq
```

> Clé gratuite sur [console.groq.com](https://console.groq.com)

### 2. Lancer les services

```bash
docker compose up
```

- Interface web → `http://localhost:8080`
- n8n → `http://localhost:5678`

### 3. Configurer n8n (première fois)

1. Créer un compte sur `http://localhost:5678`
2. **Add workflow → Import from file** → charger `n8n-workflow.json`
3. Configurer les credentials **Gmail OAuth2** dans le nœud Gmail
4. Dans le nœud **"Appel Groq API"**, mettre la clé dans le header `Authorization` : `Bearer votre_clé_groq`
5. Cliquer **Publish** en haut à droite
6. Cliquer **Execute workflow** (Démarrage manuel) pour un premier test

---

## Architecture

```
docker compose up
│
├── nginx (port 8080)     → sert l'interface web
│   └── app.js            → appelle le webhook n8n pour charger les emails
│
└── n8n (port 5678)       → workflow automatisé
    ├── Webhook GET /mailstoday  ← appelé par l'interface web
    ├── Gmail API                ← récupère les emails du jour
    ├── Groq API (LLaMA 3.3 70B) ← génère le résumé IA
    └── Respond to Webhook       → retourne le JSON à l'interface
```

---

## Structure du projet

```
USTS/
├── index.html           # Interface principale
├── style.css            # Styles
├── app.js               # Logique de l'application
├── mailstoday.json      # Données de démo (fallback si n8n indisponible)
├── nginx.conf           # Configuration nginx
├── docker-compose.yml   # Orchestration Docker
├── n8n-workflow.json    # Export du workflow n8n
├── lancer.bat           # Alternative : lancer sans Docker (Python)
└── RAPPORT.md           # Rapport de mission
```

---

## Sécurité

| Fichier | Statut |
|---------|--------|
| `.env` (clé Groq) | Ignoré par git (`.gitignore`) |
| `n8n_data/` (compte + credentials Gmail) | Ignoré par git |
| `data/` (emails réels) | Ignoré par git |

**Ne jamais commiter le fichier `.env` ni exporter le workflow n8n après y avoir mis la clé en dur.**

---

## Workflow n8n

Le workflow se déclenche de trois façons :
- **Manuellement** via le bouton dans n8n
- **Automatiquement** chaque jour ouvré à 8h
- **À la demande** via le webhook appelé par l'interface web

Il récupère les emails Gmail du jour, génère un résumé IA via Groq, et retourne le tout en JSON à l'interface web.

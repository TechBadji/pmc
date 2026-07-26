# ID-PMC — People Management Canvas

Application SaaS multi-entreprises (multi-tenant) implémentant la méthode
**ID-PMC** (People Management Canvas) de M. Ibrahima Diagne : diagnostic,
alignement, mobilisation, développement et pilotage des équipes, du modèle
**ID-3A** (Aptitudes × Attitudes = Altitude) jusqu'aux plans d'action.

## Architecture

- **Backend** : Django 5 + Django REST Framework, PostgreSQL, JWT (SimpleJWT).
  Isolation multi-tenant par `company_id` sur chaque ressource.
- **Frontend** : React 18 + TypeScript (Vite), Material UI, Redux Toolkit,
  Recharts (matrice ID-3A en nuage de points).
- **Rôles** : `SUPER_ADMIN` (éditeur, gère les entreprises clientes),
  `COMPANY_ADMIN` (CEO/dirigeant d'une entreprise cliente),
  `MANAGER` (dirige un département), `MEMBER` (collaborateur évalué).

```
pmc/
├── backend/        # Django + DRF API
│   └── apps/
│       ├── core/          # Company, User, Department, JWT auth
│       ├── skills/        # Référentiels de compétences (Hard/Soft)
│       ├── evaluations/   # Évaluations ID-3A (HSI, SSI, Altitude)
│       ├── teams/         # Cohésion d'équipe (ICE) & dynamique relationnelle
│       └── actionplans/   # Plans d'action (Module 8)
├── frontend/       # React + TypeScript (Vite)
└── docker-compose.yml
```

## Démarrage rapide

1. Copier le fichier d'environnement backend :
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Démarrer toute la stack :
   ```bash
   docker-compose up -d
   ```
3. Charger le jeu de données de démonstration (équipe dirigeante "Elias" :
   Charles, Jessica, Gilbert, Jean Jacques, Aicha, Monique, Nadine) :
   ```bash
   docker-compose exec backend python manage.py seed_demo
   docker-compose exec backend python manage.py createsuperuser  # optionnel, admin Django
   ```
4. Accéder à l'application :
   - Frontend : http://localhost:3000
   - API : http://localhost:8000/api/
   - Admin Django (Super Admin) : http://localhost:8000/admin/

### Comptes de démonstration (mot de passe : `IdPmc2026!`)

| Rôle | Email | Entreprise |
|---|---|---|
| Super Admin | admin@id-pmc.com | — |
| Admin Entreprise (CEO) | charles@elias-demo.pmc | Elias Energy Group |
| Manager | jessica@elias-demo.pmc | Elias Energy Group |
| Manager | nadine@elias-demo.pmc | Elias Energy Group |

## Développement local (sans Docker)

**Backend** (nécessite PostgreSQL local) :
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # ajuster POSTGRES_HOST=localhost
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

**Frontend** :
```bash
cd frontend
npm install
npm run dev
```

## Modèle de calcul ID-3A

- **HSI** (Hard Skills Index / Aptitudes) et **SSI** (Soft Skills Index /
  Attitudes) : moyenne pondérée (1-5) des notes de compétences du
  référentiel du poste, calculée côté serveur (`Evaluation.hsi` / `.ssi`).
- **Altitude** (Performance) : moyenne de l'atteinte des objectifs Business
  et People (%), classée en 5 paliers (Très faible → Exceptionnelle),
  affichée en couleur sur la matrice ID-3A (Aptitudes × Attitudes).

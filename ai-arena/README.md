# AI ARENA

Create your AI. Train your strategy. Enter the Arena.

Prototype: React + TypeScript + Vite + Tailwind (front), Express (back), JSON file storage.

## Lancer l'application (débutant)

1. Installer Node.js 20 ou plus récent (https://nodejs.org).
2. Ouvrir un terminal dans le dossier `ai-arena`.
3. Une seule fois : `npm install`
4. Mode développement : `npm run dev`, puis ouvrir http://localhost:5173
5. Ou mode "production" : `npm run build` puis `npm start`, puis ouvrir http://localhost:3001

Vérifications : `npm run typecheck` et `npm test`.

## Activer un vrai modèle IA (optionnel)

Sans clé, l'app tourne en **mode Demo** : les résultats sont simulés et marqués "Simulated".
Pour un vrai modèle : copier `.env.example` en `.env`, renseigner `ANTHROPIC_API_KEY`, relancer.
La clé reste côté serveur, jamais dans le navigateur.

## Structure

- `shared/` types, catalogue personnalités/spécialités/stratégies, construction des instructions de l'agent
- `server/competitions/` épreuves (questions, réponses attendues, notation) : seul le serveur les connaît
- `server/runner.ts` exécution d'un round ; `server/predictions.ts` points virtuels et règlement
- `server/stats.ts` classement, statistiques, insights ; `server/db.ts` stockage (remplaçable par PostgreSQL)
- `src/` interface (pages, composants) ; `tests/` tests automatiques
- Données : `data/db.json` (créé automatiquement, ignoré par git)

# Hoolo Service (Next.js)

Application web de gestion commerciale (boutiques, ventes, stock, réparations, clients, comptabilité) branchée sur **Firebase** (Firestore, Auth)

## Prérequis

- **Node.js** 20+ (recommandé)
- Un projet **Firebase** avec Firestore et Authentication configurés

## Installation

```bash
npm install
```

## Configuration

Créer un fichier **`.env`** à la racine du dossier `hoolo-service.next` (non versionné) avec les variables attendues par `src/firebase/config.ts`, par exemple :

- identifiants Firebase (clé API, project ID, etc.)

Ne pas commiter de secrets. Un modèle des variables attendues est fourni dans **`.env.example`** : le copier vers **`.env`** puis renseigner les valeurs.

## Scripts

| Commande        | Description                          |
|-----------------|--------------------------------------|
| `npm run dev`   | Serveur de dev (Turbopack, port **9002**) |
| `npm run build` | Build de production                  |
| `npm run start` | Démarrage après build                |
| `npm run lint`  | ESLint                               |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`) |

URL locale par défaut : **http://localhost:9002**

## Structure utile

- **`src/app/`** - routes App Router : tableau de bord, ventes, inventaire, produits, clients, etc.
- **`src/app/inventory/products/new`** - création produit (page dédiée, redirection vers la liste inventaire).
- **`src/app/inventory/products/[id]`** - fiche produit (stock boutique, édition catalogue admin, mouvements récents).
- **`src/components/`** - UI (layout, inventaire, formulaires…)
- **`src/firebase/`** - client Firestore, hooks (`useCollection`, `useDoc`…)
- **`src/firebase/services/`** - logique métier (ventes, stock, notifications, transferts…)

## Fonctionnalités notables

- Multi-boutiques (scope « boutique active »).
- Inventaire : liste, export CSV, ajustements de stock, mouvements.
- Produits : référence catalogue, scan code-barres / QR sur mobile (`@zxing/browser`) lors de la saisie.
- Rôles : certaines actions (création / édition catalogue) réservées aux **Admin**.

## Tech stack (aperçu)

- **Next.js** 15 (App Router), **React** 19
- **Tailwind CSS**, **Radix UI** (shadcn)
- **Firebase** 11
- **Genkit** (dépendances présentes pour flux IA / outils)

## Licence

Projet privé (`"private": true` dans `package.json`).

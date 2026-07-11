# PantryPal

I built this as a college student who is always in a rush, standing in front of the fridge with random, half-used ingredients, not enough time to scroll through recipes, and no energy to figure out what actually goes together. Tell PantryPal what you have (or just snap a photo of your fridge), and it turns that into real recipes you can cook right now, with a chef in your pocket if you get stuck along the way.

## Features

- **Generate recipes from what you have** — type your ingredients and get recipe options built around them.
- **Scan your fridge** — snap a photo and let Gemini detect the ingredients for you, no typing required.
- **Recipe preferences** — filter by max cook time, meal type, cuisine, and how many extra ingredients you're willing to buy.
- **Adjustable servings** — scale ingredient quantities up or down for however many people you're feeding.
- **Save your favorites** — sign in with Google to save, edit, tag, and search past recipes.
- **Ask Chef** — a recipe-scoped AI chat assistant for substitutions, technique questions, fixing mistakes, or adapting a recipe on the fly.

## Stack

- Frontend: React + TypeScript + Vite, deployed on Vercel
- Backend: Express (`server/`), deployed on Render
- AI: Google Gemini (recipe generation, fridge scanning, Ask Chef)
- Auth & storage: Firebase (Google sign-in, Firestore for saved recipes)

## Setup

Install dependencies for both the frontend and backend:

```bash
npm install
cd server && npm install
```

### Environment variables

Frontend (`.env` in the project root, see `.env.example`):

```
VITE_API_URL=              # optional, only needed in production
VITE_FIREBASE_API_KEY=     # optional, enables sign-in + saved recipes
VITE_FIREBASE_AUTH_DOMAIN= # optional
VITE_FIREBASE_PROJECT_ID=  # optional
VITE_FIREBASE_APP_ID=      # optional
```

Backend (`server/.env`, see `server/.env.example`):

```
GEMINI_API_KEY=                # required
FIREBASE_SERVICE_ACCOUNT_KEY=  # optional, enables sign-in + saved recipes
ALLOWED_ORIGIN=                # optional
```

## Running locally

Start the backend:

```bash
cd server && npm start
```

Start the frontend (in a separate terminal):

```bash
npm run dev
```

The app will be available at the printed local URL (defaults to `http://localhost:5173`).

## Other scripts

- `npm run build` — production build
- `npm run lint` — lint the frontend

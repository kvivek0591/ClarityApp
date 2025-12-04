# ClarityApp - Document Conflict Resolution Tool

A React application that detects and resolves document conflicts (temporal, contradiction, intra-doc) across knowledge bases. Built with the "Intellectual Brutalism" design aesthetic.

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **State Management:** Zustand
- **Styling:** Tailwind CSS (CDN)
- **Icons:** Lucide React

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main app with login flow |
| `/#landing` | Landing page with hero + embedded demo |
| `/#demo` | Demo mode (skips login, shows dashboard with sample data) |

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key

3. Run the app:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` (main app) or `http://localhost:3000/#landing` (landing page)

## Deploy to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Set Framework Preset to **Vite**
4. Add `GEMINI_API_KEY` environment variable
5. Deploy

## Project Structure

```
ClarityApp/
├── index.html          # HTML entry with Tailwind config
├── index.tsx           # All React components (single-file app)
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript config
├── .env.local          # Environment variables (not committed)
├── .gitignore          # Git ignore rules
├── README.md           # This file
└── patterns.md         # Reusable patterns for similar apps
```

## Design System: Intellectual Brutalism

- **Colors:** paper (#f4f4f0), ink (#272048), electric (#0808BA), engineerRed (#DC2626)
- **Typography:** Inter (sans), Newsreader (serif), JetBrains Mono (mono)
- **Borders:** Sharp corners (no border-radius)
- **Shadows:** Hard drop shadows (8px 8px, 4px 4px, 2px 2px)

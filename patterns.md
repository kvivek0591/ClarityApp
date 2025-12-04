# Patterns for Demo App Deployment

Reusable patterns for deploying React demo apps with landing pages to Vercel via GitHub.

---

## 1. Git + GitHub Setup

```bash
# Initialize git repo
git init

# Create initial commit
git add .
git commit -m "Initial commit: AppName - Description"

# Create GitHub repo and push (using GitHub CLI)
gh repo create AppName --public --source=. --remote=origin --push
```

---

## 2. Vercel Deployment

1. Go to vercel.com → "Add New Project"
2. Import repo from GitHub
3. Settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add environment variables (e.g., `GEMINI_API_KEY`)
5. Deploy

After initial setup, every `git push` to `main` triggers auto-deploy.

---

## 3. Landing Page with Embedded Demo

### Route Structure (hash-based)

| Route | Purpose |
|-------|---------|
| `/` | Main app with full functionality |
| `/#landing` | Landing page with hero + embedded demo |
| `/#demo` | Demo mode (bypasses login, pre-loaded data) |

### Router Implementation

```tsx
const App = () => {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route === '#landing') return <LandingPage />;
  if (route === '#demo') return <DemoApp />;
  return <MainApp />;
};
```

### Landing Page Structure

```tsx
const LandingPage = () => {
  const [isAppLoaded, setIsAppLoaded] = useState(false);

  return (
    <div>
      {/* Header */}
      <header>Logo + CTA Button</header>

      {/* Hero Section */}
      <section>
        <h1>Headline</h1>
        <p>Description</p>
        <a href="#demo">Launch Demo</a>
        {/* Stats/social proof */}
      </section>

      {/* Embedded Demo */}
      <section id="demo">
        <div className="browser-chrome">
          {/* Fake browser window controls */}
          <div className="controls">● ● ●</div>
          <div className="url-bar">app.example.com</div>
        </div>

        {/* Loading state */}
        {!isAppLoaded && <Spinner />}

        {/* Iframe pointing to #demo route */}
        <iframe
          src={window.location.origin + window.location.pathname + '#demo'}
          onLoad={() => setIsAppLoaded(true)}
        />
      </section>

      {/* Footer */}
      <footer>Branding</footer>
    </div>
  );
};
```

### Demo Mode (Skip Login)

Key pattern: Initialize state BEFORE rendering to avoid flash of login screen.

```tsx
const DemoApp = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Set demo state directly in store
    useStore.setState({
      currentUser: 'Demo User',
      view: 'dashboard',
      data: MOCK_DATA,
      // ... other demo state
    });
    setIsReady(true);
  }, []);

  // Show loading until state is ready
  if (!isReady) {
    return <LoadingSpinner />;
  }

  return <AppUI />;
};
```

**Why this pattern?**
- `useEffect` runs after first render
- Without `isReady` guard, first render shows login (default state)
- Loading spinner prevents flash of wrong content

---

## 4. Iframe Embedding Tips

### Prevent recursive embedding
The landing page embeds `#demo`, not `#landing`, avoiding infinite iframe nesting.

### Browser chrome styling
Makes the embedded app look like a real application window:

```tsx
<div className="border bg-white shadow-hard overflow-hidden">
  {/* Fake browser controls */}
  <div className="bg-dark px-4 py-3 flex items-center gap-3">
    <div className="flex gap-2">
      <div className="w-3 h-3 bg-red-500"></div>
      <div className="w-3 h-3 bg-yellow-500"></div>
      <div className="w-3 h-3 bg-green-500"></div>
    </div>
    <div className="bg-white/10 px-4 py-1 text-sm text-white/60">
      app.example.com
    </div>
  </div>

  {/* Iframe */}
  <iframe src="..." className="w-full" style={{ height: '700px' }} />
</div>
```

---

## 5. Commit Message Pattern

```bash
# Initial commit
git commit -m "Initial commit: AppName - Brief description"

# Adding landing page
git commit -m "Add landing page with embedded app demo

- Add LandingPage component with hero section
- Embedded iframe shows app in browser chrome frame
- Hash-based routing: #landing, #demo
- Footer with branding"

# Demo mode fix
git commit -m "Skip login in embedded demo mode

- Add #demo route that bypasses login
- DemoApp component auto-loads mock data
- Visitors see main UI immediately"

# Bug fixes
git commit -m "Fix demo mode race condition

- Add isReady state to prevent render before store init
- Show loading spinner until demo state is set"
```

---

## 6. Checklist for New Apps

- [ ] Initialize git repo
- [ ] Verify `.gitignore` excludes `.env.local` / `*.local`
- [ ] Create GitHub repo via `gh repo create`
- [ ] Add landing page component with hero
- [ ] Add hash-based router (`#landing`, `#demo`)
- [ ] Create DemoApp with `isReady` pattern
- [ ] Update iframe src to use `#demo`
- [ ] Test locally: `/#landing` shows embedded demo without login
- [ ] Push to GitHub
- [ ] Connect to Vercel, set framework to Vite
- [ ] Add environment variables in Vercel
- [ ] Deploy and verify

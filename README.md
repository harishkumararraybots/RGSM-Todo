# Todo PWA

A simple offline-first Todo list Progressive Web App (PWA). Add, edit, complete, filter, search, export/import tasks. Works offline with a service worker and installs on desktop/mobile.

## Features
- Offline ready (service worker caches app shell)
- Add/edit/delete tasks
- Mark tasks done, clear completed
- Due date with Today/Upcoming/Done filters
- Search by title/details
- Local storage persistence
- Export/Import JSON
- Install prompt

## Run locally
You can open `index.html` directly, but for PWA/service worker to work, use a local server:

- If you have VS Code Live Server extension, right-click `index.html` > "Open with Live Server".
- Or use Python (optional):

```powershell
# from the project folder
python -m http.server 5500
```

Then open http://localhost:5500/ in your browser. Visit once online to cache assets; then try offline.

## Install icons
The manifest expects PNG icons at:
- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`
- `assets/icons/maskable-192.png`
- `assets/icons/maskable-512.png`

If these are missing, the PWA still works but install badge may be limited. You can replace with your own.

### Generate icons automatically (Windows PowerShell)
Run the helper script to create branded icons (uses System.Drawing):

```powershell
# from the project folder
./scripts/generate-icons.ps1 -AppName "Todo" -Bg "#0b1220" -Fg "#22c55e"
```

This will generate the four PNGs under `assets/icons/`.

## Data location
Tasks are stored in `localStorage` under key `todo-pwa:v1:tasks`.

## Test offline and install
1) Serve locally as above and open the app.
2) In DevTools > Application > Service Workers, confirm the SW is active.
3) Toggle DevTools > Network to Offline; refresh. The app should still load with your tasks.
4) If the Install button appears, click it to install. Alternatively, use browser menu > Install App.

## Deploy to GitHub Pages (HTTPS)
This repo includes a workflow at `.github/workflows/pages.yml` that deploys the site on every push to the `main` branch.

Steps:
1. Initialize git locally and commit:

	```powershell
	git init
	git add .
	git commit -m "feat: initial Todo PWA"
	git branch -M main
	```

2. Create a new empty repo on GitHub (via the website) and copy its HTTPS URL, e.g. `https://github.com/<you>/<repo>.git`.

3. Add the remote and push:

	```powershell
	git remote add origin https://github.com/<you>/<repo>.git
	git push -u origin main
	```

4. In GitHub → your repo → Settings → Pages, ensure Source is set to "GitHub Actions". The workflow will publish automatically. The site URL will look like:
	- User/Org site: `https://<you>.github.io/`
	- Project site: `https://<you>.github.io/<repo>/`

After the first successful deploy, open the URL in Safari on iOS and use Share → Add to Home Screen to install.

## Troubleshooting
- Service worker updates: hard refresh twice or clear site data to grab latest SW.
- If icons don’t appear when installed, ensure the PNG files actually exist and sizes match the manifest.
- SW only works on localhost/HTTPS. Avoid opening `index.html` via file://.

## License
MIT

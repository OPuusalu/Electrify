# Elektrihind Notify

Small Electron app that shows and notifies electricity prices every quarter-hour.

## Features
- Tray app with notifications at xx:00 / xx:15 / xx:30 / xx:45
- Uses local `./data/YYYY-MM-DD.json` files for prices; will fetch from API when missing
- Simple UI showing current quarter price
- Optional: auto-start on Windows

## Prerequisites (Windows)
- Node.js (LTS)
- Git (recommended)
- For packaging: either `electron-builder` or `electron-packager` depending on your setup
- (Optional) ImageMagick or `png-to-ico` to create `icon.ico` for Windows

## Install & run (development)
1. Open PowerShell in project folder:
```powershell
cd "C:\Coding\elektrihind-notify-app"
```
2. Install dependencies:
```powershell
npm install
```
3. Run in development:
```powershell
npm start
```

## Packaging (Windows)
- If using electron-builder (package.json `build` present):
```powershell
npm run dist
```
- If using electron-packager:
```powershell
npm run package
# or
npx electron-packager . ElektrihindNotify --platform=win32 --arch=x64 --out=dist --icon=icon.ico --overwrite
```

Make sure you have a multi-size Windows icon (`icon.ico`) and point your packager to it (package.json `build.win.icon` or `--icon`).

## Data files
- Price files are stored in `data/YYYY-MM-DD.json`.
- Each file is an array of objects: `{ "date": "YYYY-MM-DD HH:MM", "price": <number> }`
- On startup the app checks for today's file and fetches it from the API if missing.

## Configuration & notes
- Don't commit `data/`, `node_modules/`, or secrets. Use `.gitignore` (example included).
- To enable start-on-login on Windows the app uses `app.setLoginItemSettings`.
- Notifications use the packaged app's icon and `app.setAppUserModelId` for proper toasts on Windows.

## Contributing
- Fork, create a branch, make changes, open a PR.
- Keep secrets out of the repo (use `.env`).

## License
Add a LICENSE file (MIT recommended) or choose whichever license you prefer.
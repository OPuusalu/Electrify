# Electrify

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
1. Install dependencies:
```powershell
npm install
```
2. Run in development:
```powershell
npm start
```

## Packaging (Windows)
- To create Windows build:
```powershell
npm run dist
```
or with electron-packager:
```powershell
npm run package
```

## Data files
- Price files are stored in `data/YYYY-MM-DD.json`.
- Each file is an array of objects: `{ "date": "YYYY-MM-DD HH:MM", "price": <number> }`
- On startup the app checks for today's file and fetches it from the API if missing.

## License
Add a LICENSE file (MIT recommended) or choose whichever license you prefer.

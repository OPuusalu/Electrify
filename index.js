const { app, Tray, Menu, Notification, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const zlib = require('zlib');

const APP_NAME = 'Electrify';
app.setName(APP_NAME);
if (app.setAppUserModelId) app.setAppUserModelId(APP_NAME);

let tray = null;
let mainWindow = null;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 350,
        height: 250,
        title: APP_NAME,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        icon: path.join(__dirname, 'new-icon.png'),
        resizable: false,
        maximizable: false,
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (e) => {
        if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
    return mainWindow;
}

function createTray() {
    try {
        tray = new Tray(path.join(__dirname, 'new-icon.png'));
        const menu = Menu.buildFromTemplate([
            { label: 'Näita Rakendust', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
            { type: 'separator' },
            { label: 'Välju', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setContextMenu(menu);
        tray.setToolTip(APP_NAME);
        return true;
    } catch (err) {
        console.error('createTray error:', err);
        return false;
    }
}

function showNotification(title, body) {
    if (!Notification.isSupported()) return;
    const n = new Notification({
        title: title || APP_NAME,
        body: body || '',
        icon: path.join(__dirname, 'new-icon.png'),
        silent: false
    });
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); }});
    n.show();
}

// Simple fetcher (no redirect handling). Returns parsed JSON (array) or throws.
async function fetchPrices() {
    const url = `https://elektrihind.ee/api/stock_price_daily.php`;
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Electrify/1.0' }
        }, (res) => {
            if (res.statusCode !== 200) {
                let errBody = '';
                res.on('data', c => errBody += c.toString());
                res.on('end', () => reject(new Error('Status ' + res.statusCode + ' — ' + errBody.slice(0,200))));
                return;
            }

            let stream = res;
            const enc = (res.headers['content-encoding'] || '').toLowerCase();
            if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
            else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

            let body = '';
            stream.on('data', chunk => body += chunk.toString());
            stream.on('end', () => {
                try {
                    return resolve(JSON.parse(body));
                } catch (err) {
                    const arr = body.match(/(\[.*\])/s);
                    const obj = body.match(/(\{.*\})/s);
                    const cand = arr ? arr[1] : (obj ? obj[1] : null);
                    if (cand) {
                        try { return resolve(JSON.parse(cand)); }
                        catch (e) { return reject(new Error('Failed to parse extracted JSON: ' + e.message)); }
                    }
                    return reject(new Error('Failed to parse API response: ' + err.message));
                }
            });
            stream.on('error', e => reject(e));
        }).on('error', e => reject(e));
    });
}

const watchedDir = path.join(__dirname, 'data');

function watchDataDir() {
    try {
        fs.mkdirSync(watchedDir, { recursive: true });
    } catch (e) {}
    const timers = new Map();
    try {
        fs.watch(watchedDir, (eventType, filename) => {
            if (!filename) return;
            // debounce rapid consecutive events for same file
            if (timers.has(filename)) clearTimeout(timers.get(filename));
            const t = setTimeout(() => {
                timers.delete(filename);
                console.log('data file changed:', filename, 'event:', eventType);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('data-file-changed', filename);
                }
            }, 120);
            timers.set(filename, t);
        });
    } catch (err) {
        console.error('watchDataDir error:', err);
    }
}

// ensureDataForDate: after successful write, notify immediately (optional, watcher also catches it)
async function ensureDataForDate(dateObj) {
    const dir = path.join(__dirname, 'data');
    await fsp.mkdir(dir, { recursive: true });
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const filename = `${y}-${m}-${d}.json`;
    const filepath = path.join(dir, filename);

    try {
        await fsp.access(filepath, fs.constants.F_OK);
        return true; // already present
    } catch {
        // fetch and save
        try {
            const data = await fetchPrices();
            await fsp.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
            // notify renderer right after saving to avoid waiting for fs.watch debounced event
            const filename = `${y}-${m}-${d}.json`;
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('data-file-changed', filename);
            }
            return true;
        } catch (err) {
            console.error('ensureDataForDate error for', filename, err);
            return false;
        }
    }
}

async function readPricesFileForDateObj(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const filePath = path.join(__dirname, 'data', `${y}-${m}-${d}.json`);
    try {
        const raw = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function formatQuarterDateTime(dateObj) {
    const y = dateObj.getFullYear();
    const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(Math.floor(dateObj.getMinutes() / 15) * 15).padStart(2, '0');
    return `${y}-${mo}-${d} ${hh}:${mm}`;
}

// Find price for target quarter string "YYYY-MM-DD HH:MM". Will try disk and fetch if missing.
async function getPriceForQuarterString(quarterYmdHm) {
    const [datePart] = quarterYmdHm.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);

    const trySearchIn = async (dateObj) => {
        const data = await readPricesFileForDateObj(dateObj);
        if (!Array.isArray(data)) return null;
        const found = data.find(e => String(e.date) === quarterYmdHm);
        return found ? found.price : null;
    };

    // try on-disk (target, yesterday, tomorrow)
    let price = await trySearchIn(targetDate);
    if (price != null) return price;

    const yesterday = new Date(targetDate); yesterday.setDate(targetDate.getDate() - 1);
    price = await trySearchIn(yesterday);
    if (price != null) return price;

    const tomorrow = new Date(targetDate); tomorrow.setDate(targetDate.getDate() + 1);
    price = await trySearchIn(tomorrow);
    if (price != null) return price;

    // fetch target date file and retry
    const fetched = await ensureDataForDate(targetDate);
    if (fetched) {
        price = await trySearchIn(targetDate);
        if (price != null) return price;
    }

    return null;
}

async function getPriceForNow() {
    const now = new Date();
    const quarterStr = formatQuarterDateTime(now);
    return await getPriceForQuarterString(quarterStr);
}

function msUntilNextQuarter() {
    const now = new Date();
    const currQuarter = Math.floor(now.getMinutes() / 15) * 15;
    const next = new Date(now);
    next.setMinutes(currQuarter + 15, 0, 0);
    return Math.max(0, next.getTime() - now.getTime());
}

function startQuarterScheduler() {
    async function tick() {
        try {
            const price = await getPriceForNow();
            const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const priceText = price == null ? 'Andmed puuduvad' : `${price} senti/kWh`;
            showNotification('Elektrihind Meeldetuletus', `Kell: ${timeLabel}\nHind: ${priceText}`);
        } catch (err) {
            console.error('Scheduler tick error:', err);
        } finally {
            setTimeout(tick, 15 * 60 * 1000);
        }
    }
    setTimeout(tick, msUntilNextQuarter());
}

// Optional: start-on-login for Windows
function setAutoLaunch(enable) {
    if (process.platform !== 'win32') return;
    try {
        app.setLoginItemSettings({ openAtLogin: !!enable, path: process.execPath, args: enable ? ['--hidden'] : [] });
    } catch (err) {
        console.error('setAutoLaunch error:', err);
    }
}

app.whenReady().then(async () => {
    console.log(`${APP_NAME} ready`);
    await ensureDataForDate(new Date()); // ensure today
    watchDataDir();                         // <-- start watching
    setAutoLaunch(true);
    createWindow();
    Menu.setApplicationMenu(null);
    createTray();
    startQuarterScheduler();
});

// keep single instance behavior minimal
app.on('window-all-closed', (e) => { e.preventDefault(); });
app.on('before-quit', () => { isQuitting = true; });

// IPC for renderer
ipcMain.handle('get-price-for-quarter', async (event, quarterYmdHm) => {
    try {
        const price = await getPriceForQuarterString(quarterYmdHm);
        return { price };
    } catch (err) {
        return { price: null, error: String(err) };
    }
});

ipcMain.handle('ensure-data-for-date', async (event, dateYmd) => {
    try {
        const [y, m, d] = dateYmd.split('-').map(Number);
        const ok = await ensureDataForDate(new Date(y, m - 1, d));
        return { ok };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
});
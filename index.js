const { app, Tray, Menu, Notification, BrowserWindow } = require('electron');
const path = require('path');

// Force set app name early and multiple ways
app.setName('Electrify');
if (app.setAppUserModelId) {
    app.setAppUserModelId('Electrify');
}

let tray = null;
let mainWindow = null;
let isQuitting = false;

function createTray() {
    try {
        const iconPath = path.join(__dirname, 'new-icon.png');
        
        console.log('Tray icon path:', iconPath);
        tray = new Tray(iconPath);

        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Näita Rakendust',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            { type: 'separator' },
            { 
                label: 'Välju', 
                click: () => {
                    isQuitting = true;
                    app.exit(0);
                }
            }
        ]);

        tray.setContextMenu(contextMenu);
        tray.setToolTip('Electrify');

        console.log('Electrify tray created successfully');
        return true;
    } catch (error) {
        console.error('Failed to create tray:', error);
        return false;
    }
}

function showNotification(title, body) {
    if (!Notification.isSupported()) {
        console.log('Notifications not supported');
        return;
    }

    console.log('Showing notification:', title);
    
    const notification = new Notification({
        title: title || 'Electrify',
        body: body,
        silent: false,
        icon: path.join(__dirname, 'new-icon.png')
    });

    // Override the notification's title if needed
    notification.on('show', () => {
        console.log('Electrify notification shown successfully');
    });

    notification.show();
    
    notification.on('click', () => {
        console.log('Notification clicked');
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    notification.on('failed', (error) => {
        console.log('Notification failed:', error);
    });
}

function createWindow() {
    console.log('Creating Electrify main window...');
    
    mainWindow = new BrowserWindow({
        width: 350,
        height: 250,
        title: 'Electrify',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: true,
        icon: path.join(__dirname, 'new-icon.png'),
        resizable: false,
        maximizable: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

const fs = require('fs');
const fsp = fs.promises;

// Fetch prices for a given date (no redirect handling)
async function fetchPricesForDate(dateStr) {
    const https = require('https');
    const zlib = require('zlib');

    const url = `https://elektrihind.ee/api/stock_price_daily.php?date=${encodeURIComponent(dateStr)}`;

    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Elektrihind-Notify/1.0'
            }
        }, (res) => {
            const { statusCode, headers } = res;

            if (statusCode !== 200) {
                return reject(new Error('Request failed. Status Code: ' + statusCode));
            }

            let stream = res;
            const enc = headers['content-encoding'];
            if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
            else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

            let body = '';
            stream.on('data', (chunk) => body += chunk.toString());
            stream.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    return resolve(json);
                } catch (err) {
                    // Attempt to extract JSON array/object from body
                    const arrMatch = body.match(/(\[.*\])/s);
                    const objMatch = body.match(/(\{.*\})/s);
                    const candidate = arrMatch ? arrMatch[1] : (objMatch ? objMatch[1] : null);
                    if (candidate) {
                        try {
                            return resolve(JSON.parse(candidate));
                        } catch (err2) {
                            return reject(new Error('Failed to parse extracted JSON: ' + err2.message));
                        }
                    }
                    return reject(new Error('Failed to parse API response: ' + err.message + ' — response start: ' + body.slice(0,200)));
                }
            });
            stream.on('error', (e) => reject(e));
        }).on('error', (e) => reject(e));
    });
}

async function ensureTodayData() {
    const dataDir = path.join(__dirname, 'data');
    await fsp.mkdir(dataDir, { recursive: true });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const fileName = `${y}-${m}-${d}.json`;
    const filePath = path.join(dataDir, fileName);

    try {
        await fsp.access(filePath, fs.constants.F_OK);
        console.log('Today data file already exists:', filePath);
        return;
    } catch {
        console.log('No data file for today, fetching:', filePath);
    }

    try {
        const data = await fetchPricesForDate(`${y}-${m}-${d}`);
        await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log('Saved today data to', filePath);
    } catch (err) {
        console.error('Failed to fetch or write today data:', err);
    }
}

// Enable/disable start-on-login (Windows). When packaged, process.execPath points to the app exe.
function setAutoLaunch(enable) {
    try {
        if (process.platform !== 'win32') return;
        // For Windows use app.setLoginItemSettings
        app.setLoginItemSettings({
            openAtLogin: !!enable,
            // explicit exe path (works both in dev and packaged)
            path: process.execPath,
            // optional: start hidden when possible (your app must handle --hidden)
            args: enable ? ['--hidden'] : []
        });
        console.log('Auto-launch set to', !!enable);
    } catch (err) {
        console.error('Failed to set auto-launch:', err);
    }
}

// Set app name as early as possible
app.setName('Electrify');

app.whenReady().then(async () => {
    console.log('=== Electrify Notify on valmis ===');

    // ensure today's data file exists (fetch and write if missing)
    await ensureTodayData();

    // Enable start-on-login for Windows (change to false to disable)
    setAutoLaunch(true);

    // Set app user model ID for Windows notifications
    if (process.platform === 'win32') {
        app.setAppUserModelId('Electrify');
    }
    
    createWindow();

    Menu.setApplicationMenu(null); // remove default menu

    const traySuccess = createTray();
    
    if (traySuccess) {
        console.log('Tray created successfully');
    }

    // Helper: read parsed prices array for a given Date object (local date)
    async function readPricesFileForDateObj(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const fileName = `${y}-${m}-${d}.json`;
        const filePath = path.join(__dirname, 'data', fileName);
        try {
            const raw = await fsp.readFile(filePath, 'utf8');
            return JSON.parse(raw);
        } catch (err) {
            // file missing or parse error -> return null
            return null;
        }
    }

    // Helper: format Date -> "YYYY-MM-DD HH:MM" where MM is one of 00,15,30,45
    function formatQuarterDateTime(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const hh = String(dateObj.getHours()).padStart(2, '0');
        // use exact quarter minutes (assume tick happens near exact quarter)
        const mm = String(dateObj.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}`;
    }

    // helper: fetch from API and save to data/YYYY-MM-DD.json
    async function fetchAndSaveForDateObj(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const fileName = `${y}-${m}-${d}.json`;
        const filePath = path.join(__dirname, 'data', fileName);
        try {
            const data = await fetchPricesForDate(`${y}-${m}-${d}`);
            await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
            console.log('Fetched and saved data for', `${y}-${m}-${d}`);
            return true;
        } catch (err) {
            console.error('Failed to fetch/save data for', `${y}-${m}-${d}`, err);
            return false;
        }
    }

    // Find price for the current quarter from today's data file.
    // If not present, attempt to fetch data from the API and save, then try again.
    async function getPriceForNow() {
        const now = new Date();
        const targetStr = formatQuarterDateTime(now);

        // try today's file first
        const trySearchIn = async (dateObj) => {
            const data = await readPricesFileForDateObj(dateObj);
            if (!Array.isArray(data)) return null;
            const found = data.find(e => String(e.date) === targetStr);
            return found ? found.price : null;
        };

        // 1) try immediate files (today/yesterday/tomorrow) from disk
        let price = await trySearchIn(now);
        if (price !== null && price !== undefined) return price;

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        price = await trySearchIn(yesterday);
        if (price !== null && price !== undefined) return price;

        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        price = await trySearchIn(tomorrow);
        if (price !== null && price !== undefined) return price;

        // 2) not found on disk — try fetching for the target date (and as fallback yesterday/tomorrow)
        // target date object (midnight of "now" local date)
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // try fetching today's data and re-check
        const fetchedToday = await fetchAndSaveForDateObj(targetDate);
        if (fetchedToday) {
            price = await trySearchIn(targetDate);
            if (price !== null && price !== undefined) return price;
        }

        // as an extra attempt, fetch yesterday and tomorrow as well (edge at midnight)
        const fetchedYesterday = await fetchAndSaveForDateObj(yesterday);
        if (fetchedYesterday) {
            price = await trySearchIn(yesterday);
            if (price !== null && price !== undefined) return price;
        }

        const fetchedTomorrow = await fetchAndSaveForDateObj(tomorrow);
        if (fetchedTomorrow) {
            price = await trySearchIn(tomorrow);
            if (price !== null && price !== undefined) return price;
        }

        // still nothing
        return null;
    }

    // Schedule notifications at every quarter-hour: xx:00, xx:15, xx:30, xx:45
    function msUntilNextQuarter() {
        const now = new Date();
        if (now.getMinutes() % 15 === 0 && now.getSeconds() === 0 && now.getMilliseconds() === 0) {
            return 0;
        }
        const currQuarter = Math.floor(now.getMinutes() / 15) * 15;
        const next = new Date(now);
        next.setMinutes(currQuarter + 15, 0, 0);
        return next.getTime() - now.getTime();
    }

    function startQuarterScheduler() {
        // async tick so we can await file reads
        async function tick() {
            try {
                const price = await getPriceForNow();
                const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const priceText = (price === null || price === undefined) ? 'Andmeid puuduvad' : `${price} senti/kWh`;
                showNotification('Elektrihind Meeldetuletus', `Kell: ${timeLabel}\nHind: ${priceText}`);
            } catch (err) {
                console.error('Failed to read price for notification:', err);
                showNotification('Elektrihind Meeldetuletus', 'Kell on kvartal — ei suutnud hinda lugeda.');
            } finally {
                // schedule next tick in 15 minutes (exact scheduling handled by initial msUntilNextQuarter)
                setTimeout(() => { tick().catch(console.error); }, 15 * 60 * 1000);
            }
        }

        const delay = msUntilNextQuarter();
        setTimeout(() => { tick().catch(console.error); }, delay);
    }

    startQuarterScheduler();
});

app.on('window-all-closed', (event) => {
    event.preventDefault();
});

app.on('before-quit', (event) => {
    isQuitting = true;
});
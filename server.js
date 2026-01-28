// server.js - RECARGAR-ML-SEAGM v1.1.0 - COPIA EXACTA DE BS
const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
    PORT: process.env.PORT || 3003,
    TIMEOUT: 60000,
    DELAY_RAPIDO: 300,
    DELAY_MEDIO: 800,
    MODO_TEST: process.env.MODO_TEST === 'true' ? true : false,
    URL_ML: 'https://www.seagm.com/es/mobile-legends-diamonds-top-up',
    URL_LOGIN: 'https://member.seagm.com/es/sso/login',
    EMAIL: process.env.SEAGM_EMAIL || 'jose.emigdio@gmail.com',
    PASSWORD: process.env.SEAGM_PASSWORD || 'Amateratsu20',
    COOKIES_FILE: './cookies_seagm.json'
};

const PAQUETES_SEAGM = {
    55:   { sku: '21607', nombre: '50 + 5 Diamonds (Doble)', precio: 1.14 },
    165:  { sku: '21608', nombre: '150 + 15 Diamonds (Doble)', precio: 3.39 },
    275:  { sku: '21609', nombre: '250 + 25 Diamonds (Doble)', precio: 5.64 },
    565:  { sku: '21610', nombre: '500 + 65 Diamonds (Doble)', precio: 11.49 },
    86:   { sku: '19738', nombre: '78 + 8 Diamonds', precio: 1.32 },
    112:  { sku: '4600', nombre: '102 + 10 Diamonds', precio: 1.88 },
    140:  { sku: '4601', nombre: '127 + 13 Diamonds', precio: 2.90 },
    224:  { sku: '4604', nombre: '202 + 22 Diamonds', precio: 3.77 },
    284:  { sku: '4605', nombre: '254 + 30 Diamonds', precio: 5.82 },
    344:  { sku: '19737', nombre: '310 + 34 Diamonds', precio: 5.29 },
    570:  { sku: '4612', nombre: '504 + 66 Diamonds', precio: 9.42 },
    706:  { sku: '19732', nombre: '625 + 81 Diamonds', precio: 10.59 },
    1084: { sku: '16525', nombre: '940 + 144 Diamonds', precio: 21.75 }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let browser = null;
let page = null;
let sesionActiva = false;
let cola = [];
let procesando = false;

function log(emoji, mensaje, datos = null) {
    const tiempo = new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas' });
    console.log(`[${tiempo}] ${emoji} ${mensaje}`, datos || '');
}

async function guardarCookies() {
    if (!page) return;
    try {
        const cookies = await page.cookies();
        fs.writeFileSync(CONFIG.COOKIES_FILE, JSON.stringify(cookies, null, 2));
        log('💾', 'Cookies guardadas');
    } catch (e) {}
}

async function cargarCookies() {
    if (!page) return false;
    try {
        if (fs.existsSync(CONFIG.COOKIES_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(CONFIG.COOKIES_FILE));
            await page.setCookie(...cookies);
            log('🍪', 'Cookies cargadas');
            return true;
        }
    } catch (e) {}
    return false;
}

async function cerrarPopups() {
    if (!page) return;
    try {
        await page.evaluate(() => {
            const btn = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
            if (btn) btn.click();
        });
    } catch (e) {}
}

async function verificarSesion() {
    if (!page) return false;
    try {
        await cerrarPopups();
        const logueado = await page.evaluate(() => {
            if (document.querySelector('a[href*="/logout"]')) return true;
            if (document.body.innerText.includes('jose.emigdio')) return true;
            return false;
        });
        sesionActiva = logueado;
        log(logueado ? '✅' : '❌', `Sesión: ${logueado ? 'ACTIVA' : 'NO ACTIVA'}`);
        return logueado;
    } catch (e) {
        return false;
    }
}

async function hacerLogin() {
    if (!page) return false;
    try {
        log('🔐', 'Iniciando login...');
        await page.goto(CONFIG.URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
        
        try {
            await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
            await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
            log('🍪', 'Cookiebot cerrado');
            await sleep(500);
        } catch (e) {}
        
        if (!page.url().includes('/sso/login')) {
            log('✅', 'Ya logueado');
            sesionActiva = true;
            await guardarCookies();
            return true;
        }
        
        await page.waitForSelector('#login_email', { timeout: 10000 });
        
        await page.evaluate((email, password) => {
            const emailRadio = document.querySelector('input[value="email"]');
            if (emailRadio) emailRadio.click();
            document.querySelector('#login_email').value = email;
            document.querySelector('#login_pass').value = password;
            document.querySelector('#login_btw input[type="submit"]').click();
        }, CONFIG.EMAIL, CONFIG.PASSWORD);
        
        log('🚀', 'Login enviado');
        await sleep(4000);
        
        if (!page.url().includes('/sso/login')) {
            log('✅', 'Login exitoso!');
            sesionActiva = true;
            await guardarCookies();
            return true;
        }
        
        log('❌', 'Login falló');
        return false;
    } catch (e) {
        log('❌', `Error: ${e.message}`);
        return false;
    }
}

async function asegurarSesion() {
    if (await verificarSesion()) return true;
    return await hacerLogin();
}

async function initBrowser() {
    if (browser) return;
    
    log('🚀', 'Iniciando navegador...');
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    
    browser = await puppeteer.launch({
        headless: isRailway ? 'new' : false,
        executablePath: isRailway ? '/usr/bin/google-chrome-stable' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1200,900']
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await cargarCookies();
    
    log('🌐', 'Cargando SEAGM ML...');
    await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
    await sleep(2000);
    await cerrarPopups();
    
    if (await verificarSesion()) {
        log('✅', 'Sesión activa');
        await guardarCookies();
    } else {
        await hacerLogin();
    }
    
    log('✅', 'Navegador listo');
}

async function ejecutarRecarga(userId, zoneId, diamonds, hacerCompra = true) {
    const start = Date.now();
    
    try {
        log('💎', '═'.repeat(50));
        log('💎', hacerCompra ? 'RECARGA ML' : 'TEST');
        log('📋', `User: ${userId} | Zone: ${zoneId} | Diamonds: ${diamonds}`);
        
        const paquete = PAQUETES_SEAGM[diamonds];
        if (!paquete) {
            return { success: false, error: `Paquete ${diamonds} no disponible` };
        }
        
        if (!await asegurarSesion()) {
            return { success: false, error: 'No se pudo iniciar sesión' };
        }
        
        // PASO 1: Ir a página
        log('1️⃣', 'Cargando página...');
        await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(1500);
        await cerrarPopups();
        
        // PASO 2: Seleccionar paquete
        log('2️⃣', `Seleccionando SKU: ${paquete.sku}`);
        await page.evaluate((sku) => {
            const radio = document.querySelector(`input[name="topupType"][value="${sku}"]`);
            if (radio) radio.click();
        }, paquete.sku);
        await sleep(CONFIG.DELAY_MEDIO);
        
        // PASO 3: Ingresar User ID
        log('3️⃣', 'Ingresando User ID...');
        const userInput = await page.$('input[name="userName"]') || await page.$('input[name="input1"]');
        if (!userInput) {
            return { success: false, error: 'No se encontró campo User ID' };
        }
        await userInput.click({ clickCount: 3 });
        await userInput.type(userId, { delay: 30 });
        await sleep(CONFIG.DELAY_MEDIO);
        
        // PASO 4: Ingresar Zone ID
        log('4️⃣', 'Ingresando Zone ID...');
        const zoneInput = await page.$('input[name="serverId"]') || await page.$('input[name="input2"]');
        if (!zoneInput) {
            return { success: false, error: 'No se encontró campo Zone ID' };
        }
        await zoneInput.click({ clickCount: 3 });
        await zoneInput.type(zoneId, { delay: 30 });
        await sleep(CONFIG.DELAY_MEDIO);
        
        if (!hacerCompra || CONFIG.MODO_TEST) {
            return { success: true, test_mode: true, time_ms: Date.now() - start };
        }
        
        // PASO 5: Click Comprar - MÉTODO PARA HEADLESS
        log('5️⃣', 'Click en Comprar...');
        
        // Scroll al botón y click directo con Puppeteer
        await page.waitForSelector('#ua-buyNowButton', { timeout: 10000 });
        await page.$eval('#ua-buyNowButton', btn => btn.scrollIntoView());
        await sleep(500);
        await page.click('#ua-buyNowButton');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(2000);
        
        const url1 = page.url();
        log('🔗', `URL: ${url1}`);
        
        if (!url1.includes('order_checkout') && !url1.includes('cart')) {
            return { success: false, error: 'No se pudo llegar al checkout' };
        }
        log('✅', 'En checkout');
        await cerrarPopups();
        
        // PASO 6: Pagar Ahora - EXACTO COMO BS
        log('6️⃣', 'Click Pagar Ahora...');
        await page.evaluate(() => {
            const payBtn = document.querySelector('.payNowButton');
            if (payBtn) payBtn.click();
        });
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(2000);
        
        if (!page.url().includes('pay.seagm.com')) {
            return { success: false, error: 'No se pudo llegar a página de pago' };
        }
        log('✅', 'En página de pago');
        await cerrarPopups();
        
        // PASO 7: Seleccionar SEAGM Balance
        log('7️⃣', 'Seleccionando SEAGM Balance...');
        await page.evaluate(() => {
            const divs = document.querySelectorAll('.channel');
            for (const div of divs) {
                if (div.textContent.includes('SEAGM Balance')) {
                    div.click();
                    break;
                }
            }
        });
        await sleep(CONFIG.DELAY_MEDIO);
        
        // PASO 8: Pay Now
        log('8️⃣', 'Click Pay Now...');
        await page.evaluate(() => {
            const btn = document.querySelector('.paynow input[type="submit"], label.paynow');
            if (btn) btn.click();
        });
        await sleep(2000);
        
        // PASO 9: Contraseña
        log('9️⃣', 'Ingresando contraseña...');
        const passInput = await page.$('#password');
        if (passInput) {
            await passInput.click({ clickCount: 3 });
            await passInput.type(CONFIG.PASSWORD, { delay: 30 });
            await sleep(300);
            await page.evaluate(() => {
                const btn = document.querySelector('#submit_button input[type="submit"]');
                if (btn) btn.click();
            });
        }
        
        // PASO 10: Esperar confirmación
        log('🔟', 'Esperando confirmación...');
        await sleep(5000);
        
        let orderId = null;
        for (let i = 0; i < 15; i++) {
            const res = await page.evaluate(() => {
                const el = document.querySelector('.stat.completed');
                if (el && el.textContent.includes('Completado')) {
                    const pid = document.querySelector('.pid');
                    return { ok: true, orderId: pid?.textContent?.trim() };
                }
                return null;
            });
            if (res?.ok) {
                orderId = res.orderId;
                break;
            }
            await sleep(1000);
        }
        
        if (!orderId) {
            return { success: false, error: 'No se pudo confirmar la compra' };
        }
        
        log('🎉', `COMPLETADO - Order: ${orderId}`);
        return { success: true, order_id: orderId, time_ms: Date.now() - start };
        
    } catch (e) {
        log('❌', `Error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

async function procesarCola() {
    if (procesando || cola.length === 0) return;
    procesando = true;
    const { datos, resolve } = cola.shift();
    const resultado = await ejecutarRecarga(datos.id_juego, datos.zone_id, datos.diamonds, true);
    resolve(resultado);
    procesando = false;
    if (cola.length > 0) setTimeout(procesarCola, 1000);
}

function agregarACola(datos) {
    return new Promise((resolve) => {
        cola.push({ datos, resolve });
        procesarCola();
    });
}

app.get('/', (req, res) => res.json({ status: 'ok', version: '1.1.1', sesion: sesionActiva }));
app.get('/ping', (req, res) => res.json({ pong: true }));
app.get('/sesion', async (req, res) => res.json({ sesion_activa: await verificarSesion() }));
app.post('/login', async (req, res) => res.json({ success: await hacerLogin() }));

app.post('/cargar-cookies', async (req, res) => {
    const { cookies } = req.body;
    if (!cookies || !page) return res.json({ success: false });
    await page.setCookie(...cookies);
    fs.writeFileSync(CONFIG.COOKIES_FILE, JSON.stringify(cookies, null, 2));
    await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
    res.json({ success: await verificarSesion() });
});

app.post('/test', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) return res.json({ success: false, error: 'Faltan datos' });
    res.json(await ejecutarRecarga(id_juego, zone_id, parseInt(diamonds), false));
});

app.post('/recarga', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) return res.json({ success: false, error: 'Faltan datos' });
    res.json(await agregarACola({ id_juego, zone_id, diamonds: parseInt(diamonds) }));
});

app.get('/paquetes', (req, res) => {
    const paquetes = Object.entries(PAQUETES_SEAGM).map(([d, info]) => ({
        diamonds: parseInt(d), nombre: info.nombre, precio: info.precio
    }));
    res.json({ success: true, paquetes });
});

async function start() {
    log('💎', 'RECARGAR-ML-SEAGM v1.1.0');
    await initBrowser();
    app.listen(CONFIG.PORT, '0.0.0.0', () => log('⚡', `Puerto ${CONFIG.PORT}`));
}

process.on('SIGINT', async () => { await guardarCookies(); process.exit(); });
process.on('SIGTERM', async () => { await guardarCookies(); process.exit(); });

start();

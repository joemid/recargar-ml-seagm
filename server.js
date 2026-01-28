// server.js - RECARGAR-ML-SEAGM v2.0 - COPIA EXACTA DE BS
const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// ========== CONFIG ==========
const CONFIG = {
    PORT: process.env.PORT || 3003,
    TIMEOUT: 60000,
    MAX_REINTENTOS: 2,
    DELAY_RAPIDO: 300,
    DELAY_MEDIO: 800,
    DELAY_LARGO: 1500,
    MODO_TEST: process.env.MODO_TEST === 'true' ? true : false,
    URL_ML: 'https://www.seagm.com/es/mobile-legends-diamonds-top-up',
    URL_LOGIN: 'https://member.seagm.com/es/sso/login',
    URL_BASE: 'https://www.seagm.com',
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
    const texto = `[${tiempo}] ${emoji} ${mensaje}`;
    if (datos) {
        console.log(texto, datos);
    } else {
        console.log(texto);
    }
}

async function guardarCookies() {
    if (!page) return;
    try {
        const cookies = await page.cookies();
        fs.writeFileSync(CONFIG.COOKIES_FILE, JSON.stringify(cookies, null, 2));
        log('💾', 'Cookies SEAGM guardadas');
    } catch (e) {
        log('⚠️', 'Error guardando cookies:', e.message);
    }
}

async function cargarCookies() {
    if (!page) return false;
    try {
        if (fs.existsSync(CONFIG.COOKIES_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(CONFIG.COOKIES_FILE));
            await page.setCookie(...cookies);
            log('🍪', 'Cookies SEAGM cargadas');
            return true;
        }
    } catch (e) {
        log('⚠️', 'Error cargando cookies:', e.message);
    }
    return false;
}

async function cerrarPopups() {
    if (!page) return;
    try {
        const cerrado = await page.evaluate(() => {
            const allowAll = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
            if (allowAll && allowAll.offsetParent !== null) {
                allowAll.click();
                return 'cookiebot';
            }
            return null;
        });
        if (cerrado) {
            log('🍪', `Popup cerrado: ${cerrado}`);
            await sleep(300);
        }
    } catch (e) {}
}

async function verificarSesion() {
    if (!page) return false;
    try {
        await cerrarPopups();
        const logueado = await page.evaluate(() => {
            const signOutLink = document.querySelector('a[href*="/logout"], a[href*="/signout"]');
            if (signOutLink) return true;
            const miCuenta = Array.from(document.querySelectorAll('a')).find(a => 
                a.textContent.includes('Mi Cuenta') || a.textContent.includes('My Account')
            );
            if (miCuenta) return true;
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
        log('🔐', 'Iniciando login en SEAGM...');
        await page.goto(CONFIG.URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
        
        // CERRAR COOKIEBOT PRIMERO
        try {
            await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
            await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
            log('🍪', 'Cookiebot cerrado');
            await sleep(500);
        } catch (e) {
            await page.evaluate(() => {
                const btn = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
                if (btn) btn.click();
            });
        }
        
        if (!page.url().includes('/sso/login')) {
            log('✅', 'Ya estaba logueado');
            sesionActiva = true;
            await guardarCookies();
            return true;
        }
        
        log('📧', 'Llenando formulario...');
        await page.waitForSelector('#login_email', { timeout: 10000 });
        
        const loginResult = await page.evaluate((email, password) => {
            const emailRadio = document.querySelector('input[value="email"]');
            if (emailRadio) emailRadio.click();
            
            const emailInput = document.querySelector('#login_email');
            const passInput = document.querySelector('#login_pass');
            if (!emailInput || !passInput) return { error: 'Campos no encontrados' };
            
            emailInput.value = email;
            passInput.value = password;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            const submitBtn = document.querySelector('#login_btw input[type="submit"]');
            if (submitBtn) { submitBtn.click(); return { success: true }; }
            return { error: 'No se pudo enviar' };
        }, CONFIG.EMAIL, CONFIG.PASSWORD);
        
        if (loginResult.error) {
            log('❌', loginResult.error);
            return false;
        }
        
        log('🚀', 'Login enviado');
        await sleep(4000);
        
        // Verificar
        await page.goto(CONFIG.URL_ML, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
        await sleep(1500);
        
        const logueado = await verificarSesion();
        if (logueado) {
            log('✅', 'Login exitoso!');
            await guardarCookies();
            return true;
        }
        
        log('❌', 'Login falló');
        return false;
    } catch (e) {
        log('❌', `Error en login: ${e.message}`);
        return false;
    }
}

async function asegurarSesion() {
    if (await verificarSesion()) return true;
    return await hacerLogin();
}

async function initBrowser() {
    if (browser) return;
    
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    log('🚀', 'Iniciando navegador...');
    
    browser = await puppeteer.launch({
        headless: isRailway ? 'new' : false,
        executablePath: isRailway ? '/usr/bin/google-chrome-stable' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1200,900']
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await cargarCookies();
    
    log('🌐', 'Cargando SEAGM...');
    await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
    await sleep(2000);
    await cerrarPopups();
    
    if (await verificarSesion()) {
        log('✅', 'Sesión activa');
        await guardarCookies();
    } else {
        const loginOk = await hacerLogin();
        if (!loginOk) {
            log('⚠️', 'NO SE PUDO INICIAR SESIÓN');
        }
    }
    
    log('✅', 'Navegador listo');
}

async function ejecutarRecarga(userId, zoneId, diamonds, hacerCompra = true) {
    const start = Date.now();
    
    try {
        const paquete = PAQUETES_SEAGM[diamonds];
        if (!paquete) {
            return { success: false, error: `Paquete ${diamonds} no disponible` };
        }
        
        log('💎', '═'.repeat(50));
        log('💎', 'INICIANDO RECARGA MOBILE LEGENDS (SEAGM)');
        log('📋', `User ID: ${userId} | Zone ID: ${zoneId} | Diamonds: ${diamonds}`);
        log('📦', `Paquete: ${paquete.nombre} - $${paquete.precio}`);
        
        const sesionOk = await asegurarSesion();
        if (!sesionOk) {
            return { success: false, error: 'No se pudo iniciar sesión en SEAGM' };
        }
        
        log('1️⃣', 'Cargando página de Mobile Legends...');
        await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(1500);
        await cerrarPopups();
        await sleep(500);
        
        log('2️⃣', `Seleccionando paquete SKU: ${paquete.sku}...`);
        const paqueteSeleccionado = await page.evaluate((sku) => {
            const radio = document.querySelector(`input[name="topupType"][value="${sku}"]`);
            if (radio) { radio.click(); return true; }
            const skuDiv = document.querySelector(`.SKU_type[data-sku="${sku}"]`);
            if (skuDiv) { skuDiv.click(); return true; }
            return false;
        }, paquete.sku);
        
        if (!paqueteSeleccionado) {
            return { success: false, error: `No se pudo seleccionar el paquete ${paquete.nombre}` };
        }
        await sleep(CONFIG.DELAY_MEDIO);
        
        // ========== DIFERENCIA CON BS: DOS CAMPOS ==========
        log('3️⃣', 'Ingresando User ID...');
        const userInput = await page.$('input[name="userName"]') || await page.$('input[name="input1"]');
        if (!userInput) {
            return { success: false, error: 'No se encontró el campo de User ID' };
        }
        await userInput.click({ clickCount: 3 });
        await userInput.type(userId, { delay: 30 });
        await sleep(CONFIG.DELAY_MEDIO);
        
        log('4️⃣', 'Ingresando Zone ID...');
        const zoneInput = await page.$('input[name="serverId"]') || await page.$('input[name="input2"]');
        if (!zoneInput) {
            return { success: false, error: 'No se encontró el campo de Zone ID' };
        }
        await zoneInput.click({ clickCount: 3 });
        await zoneInput.type(zoneId, { delay: 30 });
        await sleep(CONFIG.DELAY_MEDIO);
        // ========== FIN DIFERENCIA ==========
        
        if (!hacerCompra || CONFIG.MODO_TEST) {
            const elapsed = Date.now() - start;
            log('🧪', `TEST COMPLETADO en ${elapsed}ms`);
            return {
                success: true,
                test_mode: true,
                id_juego: userId,
                zone_id: zoneId,
                diamonds,
                paquete: paquete.nombre,
                precio_usd: paquete.precio,
                time_ms: elapsed,
                mensaje: 'Test exitoso - NO se realizó la compra'
            };
        }
        
        log('5️⃣', 'Haciendo click en Comprar ahora...');
        await page.evaluate(() => {
            const buyBtn = document.querySelector('#buyNowButton input[type="submit"], #ua-buyNowButton');
            if (buyBtn) buyBtn.click();
        });
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(2000);
        
        const currentUrl = page.url();
        if (!currentUrl.includes('order_checkout') && !currentUrl.includes('cart')) {
            log('⚠️', 'No se llegó al checkout, URL actual:', currentUrl);
            return { success: false, error: 'No se pudo llegar al checkout' };
        }
        
        log('✅', 'En página de checkout');
        await cerrarPopups();
        
        log('6️⃣', 'Haciendo click en Pagar Ahora...');
        await page.evaluate(() => {
            const payBtn = document.querySelector('.payNowButton');
            if (payBtn) payBtn.click();
        });
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(2000);
        
        const payUrl = page.url();
        if (!payUrl.includes('pay.seagm.com')) {
            return { success: false, error: 'No se pudo llegar a la página de pago' };
        }
        
        log('✅', 'En página de selección de pago');
        await cerrarPopups();
        
        log('7️⃣', 'Seleccionando SEAGM Balance...');
        await page.evaluate(() => {
            const allDivs = document.querySelectorAll('.channel');
            for (const div of allDivs) {
                if (div.textContent.includes('SEAGM Balance')) {
                    div.click();
                    break;
                }
            }
        });
        await sleep(CONFIG.DELAY_MEDIO);
        
        log('8️⃣', 'Haciendo click en Pay Now...');
        await page.evaluate(() => {
            const payBtn = document.querySelector('.paynow input[type="submit"], label.paynow');
            if (payBtn) payBtn.click();
        });
        await sleep(2000);
        
        log('9️⃣', 'Ingresando contraseña de confirmación...');
        const passInput = await page.$('#password');
        if (passInput) {
            await passInput.click({ clickCount: 3 });
            await passInput.type(CONFIG.PASSWORD, { delay: 30 });
            await sleep(300);
            
            log('🔟', 'Confirmando pago...');
            await page.evaluate(() => {
                const confirmBtn = document.querySelector('#submit_button input[type="submit"]');
                if (confirmBtn) confirmBtn.click();
            });
        }
        
        log('⏳', 'Esperando confirmación...');
        await sleep(5000);
        
        let orderId = null;
        for (let i = 0; i < 15; i++) {
            const resultado = await page.evaluate(() => {
                const completedEl = document.querySelector('.stat.completed');
                if (completedEl && completedEl.textContent.includes('Completado')) {
                    const pidEl = document.querySelector('.pid');
                    return { completado: true, orderId: pidEl?.textContent?.trim() };
                }
                return { completado: false };
            });
            
            if (resultado.completado) {
                orderId = resultado.orderId;
                break;
            }
            await sleep(1000);
        }
        
        if (!orderId) {
            return { success: false, error: 'No se pudo confirmar la compra' };
        }
        
        const elapsed = Date.now() - start;
        log('🎉', `RECARGA COMPLETADA en ${elapsed}ms`);
        log('🆔', `Order ID: ${orderId}`);
        
        return {
            success: true,
            id_juego: userId,
            zone_id: zoneId,
            diamonds,
            paquete: paquete.nombre,
            precio_usd: paquete.precio,
            order_id: orderId,
            time_ms: elapsed,
            mensaje: `Compra exitosa - ${orderId}`
        };
        
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
        log('📥', `Agregado a cola (posición ${cola.length})`);
        procesarCola();
    });
}

// ========== ENDPOINTS ==========
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        servicio: 'RECARGAR-ML-SEAGM',
        version: '2.0',
        sesion_activa: sesionActiva,
        modo_test: CONFIG.MODO_TEST,
        cola: cola.length
    });
});

app.get('/ping', (req, res) => res.json({ pong: true, time: Date.now() }));

app.get('/sesion', async (req, res) => {
    const activa = await verificarSesion();
    res.json({ sesion_activa: activa });
});

app.post('/login', async (req, res) => {
    const exito = await hacerLogin();
    res.json({ success: exito, sesion_activa: sesionActiva });
});

app.post('/cargar-cookies', async (req, res) => {
    const { cookies } = req.body;
    if (!cookies || !Array.isArray(cookies)) {
        return res.json({ success: false, error: 'Cookies inválidas' });
    }
    try {
        await page.setCookie(...cookies);
        fs.writeFileSync(CONFIG.COOKIES_FILE, JSON.stringify(cookies, null, 2));
        await page.goto(CONFIG.URL_ML, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        const activa = await verificarSesion();
        res.json({ success: activa, sesion_activa: activa });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/paquetes', (req, res) => {
    const lista = Object.entries(PAQUETES_SEAGM).map(([d, info]) => ({
        diamonds: parseInt(d),
        nombre: info.nombre,
        precio_usd: info.precio,
        sku: info.sku
    }));
    res.json({ success: true, paquetes: lista });
});

app.post('/test', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) {
        return res.json({ success: false, error: 'Faltan datos: id_juego, zone_id, diamonds' });
    }
    const resultado = await ejecutarRecarga(id_juego, zone_id, parseInt(diamonds), false);
    res.json(resultado);
});

app.post('/recarga', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) {
        return res.json({ success: false, error: 'Faltan datos: id_juego, zone_id, diamonds' });
    }
    log('📥', `RECARGA SOLICITADA: ID=${id_juego}(${zone_id}) Diamonds=${diamonds}`);
    const resultado = await agregarACola({ id_juego, zone_id, diamonds: parseInt(diamonds) });
    res.json(resultado);
});

// ========== INICIO ==========
async function start() {
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    
    log('💎', '═'.repeat(50));
    log('💎', 'RECARGAR-ML-SEAGM v2.0 - Mobile Legends / SEAGM');
    log('💎', '═'.repeat(50));
    log('📍', `Entorno: ${isRailway ? 'Railway' : 'Local'}`);
    log('🔌', `Puerto: ${CONFIG.PORT}`);
    log(CONFIG.MODO_TEST ? '🧪' : '💰', CONFIG.MODO_TEST ? 'MODO TEST' : 'MODO PRODUCCIÓN - Compras REALES');
    
    await initBrowser();
    
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        log('⚡', `Servidor listo en puerto ${CONFIG.PORT}`);
        log('📡', `Endpoints: GET /, /ping, /sesion, /paquetes | POST /login, /cargar-cookies, /test, /recarga`);
    });
}

process.on('SIGINT', async () => { await guardarCookies(); process.exit(); });
process.on('SIGTERM', async () => { await guardarCookies(); process.exit(); });

start();

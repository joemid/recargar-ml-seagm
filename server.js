// server.js - RECARGAR-ML-SEAGM v1.0 - Mobile Legends con SEAGM Balance
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
    DELAY_RAPIDO: 300,
    DELAY_MEDIO: 800,
    DELAY_LARGO: 1500,
    MODO_TEST: process.env.MODO_TEST === 'true' ? true : false,
    // URLs de SEAGM
    URL_MOBILE_LEGENDS: 'https://www.seagm.com/es/mobile-legends-diamonds-top-up',
    URL_LOGIN: 'https://member.seagm.com/es/sso/login',
    // Credenciales
    EMAIL: process.env.SEAGM_EMAIL || 'jose.emigdio@gmail.com',
    PASSWORD: process.env.SEAGM_PASSWORD || 'Amateratsu20',
    COOKIES_FILE: './cookies_seagm.json'
};

// Paquetes Mobile Legends SEAGM
// Recarga Doble (mayor valor)
const PAQUETES_DOBLE = {
    55:   { sku: '21607', nombre: '50 + 5 Diamonds (Doble)', precio: 1.14 },
    165:  { sku: '21608', nombre: '150 + 15 Diamonds (Doble)', precio: 3.39 },
    275:  { sku: '21609', nombre: '250 + 25 Diamonds (Doble)', precio: 5.64 },
    565:  { sku: '21610', nombre: '500 + 65 Diamonds (Doble)', precio: 11.49 }
};

// Paquetes regulares
const PAQUETES_REGULAR = {
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

// Todos los paquetes combinados
const PAQUETES_SEAGM = { ...PAQUETES_DOBLE, ...PAQUETES_REGULAR };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let page = null;
let sesionActiva = false;
let cola = [];
let procesando = false;

// ========== LOGS ==========
function log(emoji, mensaje, datos = null) {
    const tiempo = new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas' });
    const texto = `[${tiempo}] ${emoji} ${mensaje}`;
    if (datos) {
        console.log(texto, datos);
    } else {
        console.log(texto);
    }
}

// ========== COOKIES / SESIÓN ==========
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
            const allowAll = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, #CybotCookiebotDialogBodyButtonAccept');
            if (allowAll && allowAll.offsetParent !== null) {
                allowAll.click();
                return 'cookiebot';
            }
            const cookiebotDialog = document.querySelector('#CybotCookiebotDialog');
            if (cookiebotDialog && cookiebotDialog.offsetParent !== null) {
                const btn = cookiebotDialog.querySelector('button[id*="Allow"], button[id*="Accept"]');
                if (btn) { btn.click(); return 'cookiebot-dialog'; }
            }
            const allButtons = Array.from(document.querySelectorAll('button'));
            for (const btn of allButtons) {
                if (btn.textContent.trim() === 'Allow all' && btn.offsetParent !== null) {
                    btn.click();
                    return 'allow-all';
                }
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
            if (miCuenta && miCuenta.offsetParent !== null) return true;
            const bodyText = document.body.innerText;
            if (bodyText.includes('jose.emigdio') || bodyText.includes('RecargasNexus')) return true;
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
        await page.goto(CONFIG.URL_LOGIN, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(2000);
        await cerrarPopups();
        
        if (!page.url().includes('/sso/login')) {
            log('✅', 'Ya estaba logueado');
            sesionActiva = true;
            await guardarCookies();
            return true;
        }
        
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
            return { error: 'Botón no encontrado' };
        }, CONFIG.EMAIL, CONFIG.PASSWORD);
        
        if (loginResult.error) {
            log('❌', loginResult.error);
            return false;
        }
        
        await sleep(5000);
        
        if (!page.url().includes('/sso/login')) {
            log('✅', 'Login exitoso!');
            sesionActiva = true;
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
    const logueado = await verificarSesion();
    if (logueado) return true;
    log('⚠️', 'Sesión no detectada, intentando login...');
    return await hacerLogin();
}

// ========== INICIAR NAVEGADOR ==========
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await cargarCookies();
    
    log('🌐', 'Cargando SEAGM Mobile Legends...');
    await page.goto(CONFIG.URL_MOBILE_LEGENDS, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
    await sleep(2000);
    await cerrarPopups();
    
    const logueado = await verificarSesion();
    if (logueado) {
        log('✅', 'Sesión SEAGM activa');
        await guardarCookies();
    } else {
        const loginOk = await hacerLogin();
        if (!loginOk) {
            log('⚠️', '═'.repeat(45));
            log('⚠️', 'NO SE PUDO INICIAR SESIÓN');
            log('⚠️', 'Usa POST /cargar-cookies para subir cookies');
            log('⚠️', '═'.repeat(45));
        }
    }
    
    log('✅', 'Navegador listo');
}

// ========== RECARGA MOBILE LEGENDS SEAGM ==========
async function ejecutarRecarga(userId, zoneId, diamonds, hacerCompra = true) {
    const start = Date.now();
    
    try {
        log('💎', '═'.repeat(50));
        log('💎', hacerCompra ? 'INICIANDO RECARGA MOBILE LEGENDS (SEAGM)' : 'TEST (SIN COMPRAR)');
        log('📋', `User ID: ${userId} | Zone ID: ${zoneId} | Diamonds: ${diamonds}`);
        
        // Verificar paquete
        const paquete = PAQUETES_SEAGM[diamonds];
        if (!paquete) {
            return { success: false, error: `Paquete de ${diamonds} Diamonds no disponible` };
        }
        log('📦', `Paquete: ${paquete.nombre} - $${paquete.precio}`);
        
        // Asegurar sesión
        const sesionOk = await asegurarSesion();
        if (!sesionOk) {
            return { success: false, error: 'No se pudo iniciar sesión en SEAGM' };
        }
        
        // ========== PASO 1: Ir a página de ML ==========
        log('1️⃣', 'Cargando página de Mobile Legends...');
        await page.goto(CONFIG.URL_MOBILE_LEGENDS, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(1500);
        await cerrarPopups();
        
        // ========== PASO 2: Seleccionar paquete ==========
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
        
        // ========== PASO 3 y 4: Ingresar User ID y Zone ID ==========
        log('3️⃣', 'Ingresando User ID...');
        await page.waitForSelector('input[name="input1"], input[placeholder*="User ID"]', { timeout: 10000 });
        
        log('4️⃣', 'Ingresando Zone ID...');
        const fillResult = await page.evaluate((userId, zoneId) => {
            const userInput = document.querySelector('input[name="input1"]') || 
                              document.querySelector('input[placeholder="Please enter User ID"]');
            const zoneInput = document.querySelector('input[name="input2"]') ||
                              document.querySelector('input[placeholder="Please enter Zone ID"]');
            
            // DEBUG: mostrar qué encontró
            const debug = {
                userFound: !!userInput,
                zoneFound: !!zoneInput,
                userSelector: userInput ? (userInput.name || userInput.placeholder) : null,
                zoneSelector: zoneInput ? (zoneInput.name || zoneInput.placeholder) : null,
                allInputs: Array.from(document.querySelectorAll('input')).map(i => i.name || i.placeholder || i.type).slice(0, 10)
            };
            
            if (!userInput || !zoneInput) {
                return { error: 'Campos no encontrados', debug };
            }
            
            userInput.value = userId;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            userInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            zoneInput.value = zoneId;
            zoneInput.dispatchEvent(new Event('input', { bubbles: true }));
            zoneInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, user: userInput.value, zone: zoneInput.value, debug };
        }, userId, zoneId);
        
        log('🔍', `DEBUG campos: ${JSON.stringify(fillResult.debug || {})}`);
        
        if (fillResult.error) {
            return { success: false, error: fillResult.error };
        }
        log('✅', `Campos: User=${fillResult.user} Zone=${fillResult.zone}`);
        await sleep(CONFIG.DELAY_MEDIO);
        
        // Si es modo test, parar aquí
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
        
        // ========== PASO 5: Click en "Compra ahora" ==========
        log('5️⃣', 'Haciendo click en Comprar ahora...');
        
        // DEBUG: ver qué botón encuentra
        const buyBtnDebug = await page.evaluate(() => {
            const btn1 = document.querySelector('#buyNowButton input[type="submit"]');
            const btn2 = document.querySelector('#ua-buyNowButton');
            const btn3 = document.querySelector('.buy-now-btn');
            const btn4 = document.querySelector('input[value*="COMPRA"]');
            return {
                buyNowButton: !!btn1,
                uaBuyNow: !!btn2,
                buyNowBtn: !!btn3,
                inputCompra: !!btn4,
                btn1Text: btn1?.value || btn1?.textContent,
                btn2Text: btn2?.value || btn2?.textContent
            };
        });
        log('🔍', `DEBUG botones compra: ${JSON.stringify(buyBtnDebug)}`);
        
        const clickResult = await page.evaluate(() => {
            const buyBtn = document.querySelector('#buyNowButton input[type="submit"]') || 
                           document.querySelector('#ua-buyNowButton') ||
                           document.querySelector('input[value*="COMPRA"]');
            if (buyBtn) { 
                buyBtn.click(); 
                return { clicked: true, selector: buyBtn.id || buyBtn.className || buyBtn.value };
            }
            return { clicked: false };
        });
        log('🔍', `Click result: ${JSON.stringify(clickResult)}`);
        
        // NO usar waitForNavigation - solo esperar
        log('⏳', 'Esperando navegación...');
        await sleep(5000);
        await cerrarPopups();
        
        // Verificar checkout
        const currentUrl = page.url();
        log('🔗', `URL después de click: ${currentUrl}`);
        
        if (!currentUrl.includes('order_checkout') && !currentUrl.includes('cart')) {
            log('❌', 'No llegó a checkout');
            return { success: false, error: 'No se pudo llegar al checkout', url: currentUrl };
        }
        log('✅', 'En página de checkout');
        
        // ========== PASO 6: Click en "Pagar Ahora" ==========
        log('6️⃣', 'Haciendo click en Pagar Ahora...');
        
        // DEBUG: ver qué botón encuentra
        const payBtnDebug = await page.evaluate(() => {
            const btn1 = document.querySelector('a.payNowButton');
            const btn2 = document.querySelector('.payNowButton');
            const btn3 = document.querySelector('#ua-checkoutOrderButton');
            return {
                aPayNow: !!btn1,
                payNowButton: !!btn2,
                uaCheckout: !!btn3,
                btn1Text: btn1?.textContent?.trim(),
                btn2Text: btn2?.textContent?.trim()
            };
        });
        log('🔍', `DEBUG botones pagar: ${JSON.stringify(payBtnDebug)}`);
        
        await page.evaluate(() => {
            const payBtn = document.querySelector('a.payNowButton') || 
                           document.querySelector('.payNowButton') || 
                           document.querySelector('#ua-checkoutOrderButton');
            if (payBtn) payBtn.click();
        });
        
        log('⏳', 'Esperando navegación a pago...');
        await sleep(5000);
        await cerrarPopups();
        
        // Verificar página de pago
        const payUrl = page.url();
        log('🔗', `URL página pago: ${payUrl}`);
        
        if (!payUrl.includes('pay.seagm.com')) {
            log('❌', 'No llegó a página de pago');
            return { success: false, error: 'No se pudo llegar a la página de pago', url: payUrl };
        }
        log('✅', 'En página de selección de pago');
        await cerrarPopups();
        await sleep(500);
        
        // ========== PASO 7: Seleccionar SEAGM Balance ==========
        log('7️⃣', 'Seleccionando SEAGM Balance...');
        
        const balanceSeleccionado = await page.evaluate(() => {
            const channels = document.querySelectorAll('.channel');
            for (const ch of channels) {
                if (ch.textContent.includes('SEAGM Balance') || ch.textContent.includes('SEAGM Saldo')) {
                    ch.click();
                    return { selected: true, text: ch.textContent.substring(0, 30) };
                }
            }
            const radioBalance = document.querySelector('input[value*="balance"], input[name="channel"][value="16"]');
            if (radioBalance) { radioBalance.click(); return { selected: true, via: 'radio' }; }
            return { selected: false, channelsFound: channels.length };
        });
        log('🔍', `DEBUG balance: ${JSON.stringify(balanceSeleccionado)}`);
        
        if (!balanceSeleccionado.selected) {
            return { success: false, error: 'No se pudo seleccionar SEAGM Balance' };
        }
        await sleep(CONFIG.DELAY_MEDIO);
        
        // ========== PASO 8: Click en "Pay Now" ==========
        log('8️⃣', 'Haciendo click en Pay Now...');
        
        await page.evaluate(() => {
            const payNow = document.querySelector('.btn-pay, button[type="submit"], input[type="submit"]');
            if (payNow) payNow.click();
        });
        
        await sleep(3000);
        
        // ========== PASO 9: Ingresar contraseña de confirmación ==========
        log('9️⃣', 'Ingresando contraseña de confirmación...');
        
        await page.waitForSelector('#password, input[name="password"]', { timeout: 15000 }).catch(() => {});
        await sleep(500);
        
        const passResult = await page.evaluate((password) => {
            const passInput = document.querySelector('#password') || document.querySelector('input[name="password"]');
            if (!passInput) return { error: 'Campo no encontrado' };
            
            passInput.value = password;
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
            passInput.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
        }, CONFIG.PASSWORD);
        
        if (passResult.error) {
            log('⚠️', passResult.error);
        } else {
            await sleep(500);
            log('🔟', 'Confirmando pago...');
            await page.evaluate(() => {
                const submitBtn = document.querySelector('#submit_button input[type="submit"], #submit_button');
                if (submitBtn) submitBtn.click();
            });
        }
        
        // ========== PASO 10: Esperar confirmación ==========
        log('⏳', 'Esperando confirmación...');
        
        await sleep(5000);
        
        // Verificar éxito
        const resultado = await page.evaluate(() => {
            const completado = document.querySelector('.stat.completed, .status-completed, .success');
            if (completado) return { exito: true };
            
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes('completado') || bodyText.includes('completed') || bodyText.includes('success')) {
                return { exito: true };
            }
            
            const orderId = document.querySelector('.pid, .order-id, [class*="order"]');
            if (orderId) {
                const match = orderId.textContent.match(/P\d+/);
                if (match) return { exito: true, orderId: match[0] };
            }
            
            return { exito: false };
        });
        
        // Obtener Order ID
        let orderId = resultado.orderId || null;
        if (!orderId) {
            const urlMatch = page.url().match(/trade_id=(\d+)/);
            if (urlMatch) orderId = 'P' + urlMatch[1];
        }
        
        if (!orderId) {
            orderId = await page.evaluate(() => {
                const pidEl = document.querySelector('.pid');
                if (pidEl) return pidEl.textContent.trim();
                const match = document.body.innerText.match(/P\d{8,}/);
                return match ? match[0] : null;
            });
        }
        
        const elapsed = Date.now() - start;
        
        if (resultado.exito || orderId) {
            log('🎉', `RECARGA COMPLETADA en ${elapsed}ms`);
            log('🎫', `Order ID: ${orderId}`);
            
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
        } else {
            log('❌', 'No se pudo confirmar la compra');
            return { success: false, error: 'No se pudo confirmar la compra', time_ms: elapsed };
        }
        
    } catch (e) {
        log('❌', `Error: ${e.message}`);
        return { success: false, error: e.message, time_ms: Date.now() - start };
    }
}

// ========== COLA ==========
async function procesarCola() {
    if (procesando || cola.length === 0) return;
    
    procesando = true;
    const { datos, resolve } = cola.shift();
    
    log('⚡', `Procesando de cola (quedan ${cola.length})`);
    
    const resultado = await ejecutarRecarga(datos.id_juego, datos.zone_id, datos.diamonds, true);
    resolve(resultado);
    
    procesando = false;
    
    if (cola.length > 0) {
        setTimeout(procesarCola, 1000);
    }
}

function agregarACola(datos) {
    return new Promise((resolve) => {
        cola.push({ datos, resolve });
        log('📋', `Agregado a cola (posición ${cola.length})`);
        procesarCola();
    });
}

// ========== ENDPOINTS ==========

app.get('/', (req, res) => {
    res.json({ 
        status: 'ok',
        servicio: 'RECARGAR-ML-SEAGM',
        version: '1.0.0',
        plataforma: 'SEAGM',
        sesion_activa: sesionActiva,
        en_cola: cola.length,
        procesando,
        modo_test: CONFIG.MODO_TEST
    });
});

app.get('/ping', (req, res) => {
    res.json({ pong: true, timestamp: Date.now() });
});

app.get('/sesion', async (req, res) => {
    const activa = await verificarSesion();
    res.json({ sesion_activa: activa, mensaje: activa ? 'Sesión activa' : 'Necesitas iniciar sesión' });
});

app.post('/cargar-cookies', async (req, res) => {
    try {
        const { cookies } = req.body;
        if (!cookies || !Array.isArray(cookies)) {
            return res.json({ success: false, error: 'Envía { "cookies": [...] }' });
        }
        if (!page) {
            return res.json({ success: false, error: 'Navegador no inicializado' });
        }
        
        await page.setCookie(...cookies);
        fs.writeFileSync(CONFIG.COOKIES_FILE, JSON.stringify(cookies, null, 2));
        log('🍪', `${cookies.length} cookies cargadas`);
        
        await page.goto(CONFIG.URL_MOBILE_LEGENDS, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(2000);
        await cerrarPopups();
        
        const logueado = await verificarSesion();
        res.json({ success: logueado, sesion_activa: logueado });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/login', async (req, res) => {
    const exito = await hacerLogin();
    res.json({ success: exito });
});

app.post('/test', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) {
        return res.json({ success: false, error: 'Faltan datos (id_juego, zone_id, diamonds)' });
    }
    const resultado = await ejecutarRecarga(id_juego, zone_id, parseInt(diamonds), false);
    res.json({ ...resultado, test_mode: true });
});

app.post('/recarga', async (req, res) => {
    const { id_juego, zone_id, diamonds } = req.body;
    if (!id_juego || !zone_id || !diamonds) {
        return res.json({ success: false, error: 'Faltan datos (id_juego, zone_id, diamonds)' });
    }
    
    log('🎯', `RECARGA SOLICITADA: ID=${id_juego}(${zone_id}) Diamonds=${diamonds}`);
    
    const resultado = await agregarACola({
        id_juego,
        zone_id,
        diamonds: parseInt(diamonds)
    });
    
    res.json(resultado);
});

app.get('/paquetes', (req, res) => {
    const dobles = Object.entries(PAQUETES_DOBLE).map(([d, info]) => ({
        diamonds: parseInt(d), nombre: info.nombre, precio_usd: info.precio, sku: info.sku, tipo: 'doble'
    }));
    const regulares = Object.entries(PAQUETES_REGULAR).map(([d, info]) => ({
        diamonds: parseInt(d), nombre: info.nombre, precio_usd: info.precio, sku: info.sku, tipo: 'regular'
    }));
    
    res.json({ success: true, plataforma: 'SEAGM', paquetes_doble: dobles, paquetes_regular: regulares });
});

// ========== INICIO ==========
async function start() {
    console.log('\n');
    log('💎', '═'.repeat(50));
    log('💎', 'RECARGAR-ML-SEAGM v1.0 - Mobile Legends / SEAGM');
    log('💎', '═'.repeat(50));
    log('📍', `Entorno: ${process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'}`);
    log('📍', `Puerto: ${CONFIG.PORT}`);
    
    if (CONFIG.MODO_TEST) {
        log('🧪', '⚠️  MODO TEST - NO compras reales');
    } else {
        log('🚨', '💰 MODO PRODUCCIÓN - Compras REALES');
    }
    
    await initBrowser();
    
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        log('⚡', `Servidor listo en puerto ${CONFIG.PORT}`);
        log('📋', 'Endpoints: GET /, /ping, /sesion, /paquetes | POST /login, /cargar-cookies, /test, /recarga');
    });
}

process.on('SIGINT', async () => { 
    if (page) await guardarCookies();
    if (browser) await browser.close(); 
    process.exit(); 
});
process.on('SIGTERM', async () => { 
    if (page) await guardarCookies();
    if (browser) await browser.close(); 
    process.exit(); 
});

start();

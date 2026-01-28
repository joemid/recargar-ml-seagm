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
        await page.goto(CONFIG.URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
        await sleep(1000);
        
        // CERRAR COOKIEBOT PRIMERO (igual que BS)
        try {
            await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 3000 });
            await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
            log('🍪', 'Cookiebot cerrado');
            await sleep(500);
        } catch (e) {
            await page.evaluate(() => {
                const btn = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
                if (btn) btn.click();
            });
        }
        
        const currentUrl = page.url();
        if (!currentUrl.includes('/sso/login')) {
            log('✅', 'Ya estaba logueado');
            sesionActiva = true;
            await guardarCookies();
            return true;
        }
        
        log('📧', 'Llenando formulario...');
        await page.waitForSelector('#login_email', { timeout: 10000 });
        
        // LOGIN CON EVALUATE (igual que BS que funciona en Railway)
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
        
        log('🚀', 'Login enviado, esperando...');
        await sleep(4000);
        
        // Verificar navegando a ML
        await page.goto(CONFIG.URL_MOBILE_LEGENDS, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
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
        
        // ========== PASO 3: Ingresar User ID ==========
        log('3️⃣', 'Ingresando User ID...');
        
        // Esperar a que cargue el campo
        await page.waitForSelector('input[name="input1"], input[placeholder*="User ID"]', { timeout: 10000 });
        
        const userInput = await page.$('input[name="input1"]') || 
                          await page.$('input[placeholder="Please enter User ID"]');
        if (!userInput) {
            return { success: false, error: 'No se encontró el campo de User ID' };
        }
        await userInput.click({ clickCount: 3 });
        await userInput.type(userId, { delay: 30 });
        await sleep(CONFIG.DELAY_MEDIO);
        
        // ========== PASO 4: Ingresar Zone ID ==========
        log('4️⃣', 'Ingresando Zone ID...');
        const zoneInput = await page.$('input[name="input2"]') ||
                          await page.$('input[placeholder="Please enter Zone ID"]');
        if (!zoneInput) {
            return { success: false, error: 'No se encontró el campo de Zone ID' };
        }
        await zoneInput.click({ clickCount: 3 });
        await zoneInput.type(zoneId, { delay: 30 });
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
        
        await page.evaluate(() => {
            const buyBtn = document.querySelector('#buyNowButton input[type="submit"], #ua-buyNowButton');
            if (buyBtn) buyBtn.click();
        });
        
        await sleep(3000);
        
        // FALLBACK: Si el click no navegó (pasa en Railway), hacer POST manual
        if (page.url().includes('mobile-legends-diamonds-top-up')) {
            log('⚠️', 'Click no navegó, haciendo POST manual...');
            
            const formData = await page.evaluate(() => {
                const btn = document.querySelector('#ua-buyNowButton');
                const form = btn ? btn.closest('form') : null;
                if (!form) return null;
                
                const data = {};
                form.querySelectorAll('input').forEach(input => {
                    if (input.name && input.type !== 'submit') {
                        if (input.type === 'radio') {
                            if (input.checked) data[input.name] = input.value;
                        } else {
                            data[input.name] = input.value;
                        }
                    }
                });
                return { action: form.action, data };
            });
            
            if (formData && formData.action) {
                log('📋', `POST a: ${formData.action}`);
                await page.evaluate((action, data) => {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = action;
                    for (const [key, value] of Object.entries(data)) {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = key;
                        input.value = value;
                        form.appendChild(input);
                    }
                    document.body.appendChild(form);
                    form.submit();
                }, formData.action, formData.data);
                
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                await sleep(2000);
                
                // Debug: ver dónde estamos
                const postUrl = page.url();
                log('🔗', `URL después de POST: ${postUrl}`);
                
                const pageTitle = await page.title();
                log('📄', `Título: ${pageTitle}`);
            }
        } else {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
            await sleep(2000);
        }
        
        await cerrarPopups();
        
        // Verificar checkout
        const currentUrl = page.url();
        log('🔗', `URL actual: ${currentUrl}`);
        
        // Debug: ver contenido de la página
        const pageInfo = await page.evaluate(() => {
            return {
                title: document.title,
                h1: document.querySelector('h1')?.textContent?.trim(),
                bodyText: document.body.innerText.substring(0, 300)
            };
        });
        log('📄', `Página: ${pageInfo.title} | H1: ${pageInfo.h1}`);
        
        if (!currentUrl.includes('order_checkout') && !currentUrl.includes('cart') && !currentUrl.includes('directtopup') && !currentUrl.includes('game_topup_buy')) {
            log('❌', `No se llegó al checkout. Body: ${pageInfo.bodyText.substring(0, 100)}`);
            return { success: false, error: 'No se pudo llegar al checkout' };
        }
        log('✅', 'En página de checkout');
        
        // DEBUG: Si es directtopup, ver qué hay
        if (currentUrl.includes('directtopup')) {
            log('🔍', 'Página directtopup detectada - flujo diferente');
            
            const pageContent = await page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                const buttons = document.querySelectorAll('button, input[type="submit"], .btn');
                const inputs = document.querySelectorAll('input');
                
                return {
                    forms: forms.length,
                    formActions: Array.from(forms).map(f => f.action).slice(0, 3),
                    buttons: Array.from(buttons).map(b => b.textContent?.trim() || b.value || b.className).slice(0, 10),
                    inputs: Array.from(inputs).map(i => ({ name: i.name, type: i.type, id: i.id })).slice(0, 10),
                    hasPassword: !!document.querySelector('#password, input[name="password"]'),
                    hasBalance: document.body.innerText.includes('SEAGM Balance'),
                    bodySnippet: document.body.innerText.substring(0, 500)
                };
            });
            log('📋', `Forms: ${pageContent.forms}, Buttons: ${JSON.stringify(pageContent.buttons)}`);
            log('📋', `Inputs: ${JSON.stringify(pageContent.inputs)}`);
            log('📋', `hasPassword: ${pageContent.hasPassword}, hasBalance: ${pageContent.hasBalance}`);
            log('📋', `Body: ${pageContent.bodySnippet.substring(0, 200)}`);
            
            // Si ya tiene campo de password, es página de pago directo
            if (pageContent.hasPassword) {
                log('🔐', 'Campo de password encontrado - saltando a confirmación');
                
                const passwordInput = await page.$('#password') || await page.$('input[name="password"]');
                if (passwordInput) {
                    await passwordInput.click({ clickCount: 3 });
                    await passwordInput.type(CONFIG.PASSWORD, { delay: 30 });
                    await sleep(500);
                    
                    await page.evaluate(() => {
                        const submitBtn = document.querySelector('#submit_button input[type="submit"], button[type="submit"], input[type="submit"]');
                        if (submitBtn) submitBtn.click();
                    });
                    
                    await sleep(5000);
                    // Ir directo a verificar completado
                }
            }
        }
        
        // ========== PASO 6: Click en "Pagar Ahora" ==========
        log('6️⃣', 'Haciendo click en Pagar Ahora...');
        
        // Debug: ver qué botones hay
        const botonesDisponibles = await page.evaluate(() => {
            const btns = document.querySelectorAll('button, input[type="submit"], a.btn, .btn, .payNowButton');
            return Array.from(btns).map(b => b.textContent?.trim() || b.value || b.className).slice(0, 5);
        });
        log('🔍', `Botones: ${JSON.stringify(botonesDisponibles)}`);
        
        await page.evaluate(() => {
            const payBtn = document.querySelector('.payNowButton');
            if (payBtn) payBtn.click();
        });
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await sleep(2000);
        await cerrarPopups();
        
        // Verificar página de pago
        const payUrl = page.url();
        log('🔗', `URL de pago: ${payUrl}`);
        if (!payUrl.includes('pay.seagm.com') && !payUrl.includes('directtopup')) {
            return { success: false, error: 'No se pudo llegar a la página de pago' };
        }
        log('✅', 'En página de selección de pago');
        await cerrarPopups();
        await sleep(2000); // Más tiempo para que cargue (igual que BS)
        
        // Esperar a que aparezcan las opciones de pago
        await page.waitForSelector('.channel, [class*="payment"]', { timeout: 10000 }).catch(() => {});
        await sleep(1000);
        
        // ========== PASO 7: Seleccionar SEAGM Balance ==========
        log('7️⃣', 'Seleccionando SEAGM Balance...');
        
        const balanceSeleccionado = await page.evaluate(() => {
            // Buscar en divs con clase channel o payment
            const allDivs = document.querySelectorAll('.channel, [class*="payment"]');
            for (const div of allDivs) {
                if (div.textContent.includes('SEAGM Balance') || div.textContent.includes('SEAGM Saldo')) {
                    div.click();
                    return true;
                }
            }
            // Fallback: buscar imagen
            const balanceImg = document.querySelector('img[alt="SEAGM Balance"]');
            if (balanceImg) {
                balanceImg.closest('.channel, label, div')?.click();
                return true;
            }
            // Fallback: radio button
            const radioBalance = document.querySelector('input[value*="balance"], input[name="channel"][value="16"]');
            if (radioBalance) { radioBalance.click(); return true; }
            return false;
        });
        
        if (!balanceSeleccionado) {
            log('⚠️', 'No se pudo seleccionar SEAGM Balance automáticamente');
        }
        await sleep(CONFIG.DELAY_MEDIO);
        
        // ========== PASO 8: Click en "Pay Now" ==========
        log('8️⃣', 'Haciendo click en Pay Now...');
        
        await page.evaluate(() => {
            const payNow = document.querySelector('.paynow input[type="submit"], label.paynow, .btn-pay, button[type="submit"], input[type="submit"]');
            if (payNow) payNow.click();
        });
        
        await sleep(3000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        await sleep(2000);
        
        // ========== PASO 9: Ingresar contraseña de confirmación ==========
        log('9️⃣', 'Ingresando contraseña de confirmación...');
        
        // Debug
        const passUrl = page.url();
        log('🔗', `URL: ${passUrl}`);
        
        await page.waitForSelector('#password, input[name="password"]', { timeout: 15000 }).catch(() => {});
        await sleep(500);
        
        const passwordInput = await page.$('#password') || await page.$('input[name="password"]');
        if (passwordInput) {
            await passwordInput.click({ clickCount: 3 });
            await passwordInput.type(CONFIG.PASSWORD, { delay: 30 });
            await sleep(CONFIG.DELAY_RAPIDO);
            
            // Confirmar pago
            log('🔟', 'Confirmando pago...');
            await page.evaluate(() => {
                const submitBtn = document.querySelector('#submit_button input[type="submit"], #submit_button');
                if (submitBtn) submitBtn.click();
            });
        }
        
        // ========== PASO 10: Esperar confirmación (igual que BS) ==========
        log('⏳', 'Esperando confirmación...');
        
        await sleep(5000);
        
        let orderId = null;
        let completado = false;
        
        for (let i = 0; i < 15; i++) {
            const resultado = await page.evaluate(() => {
                const completadoEl = document.querySelector('.stat.completed, [class*="completed"]');
                if (completadoEl && completadoEl.textContent.includes('Completado')) {
                    const pidEl = document.querySelector('.pid');
                    const orderId = pidEl ? pidEl.textContent.trim() : null;
                    return { completado: true, orderId };
                }
                const errorEl = document.querySelector('.alert, .error, [class*="error"]');
                if (errorEl && errorEl.textContent.trim()) {
                    return { error: errorEl.textContent.trim() };
                }
                return null;
            });
            
            if (resultado) {
                if (resultado.error) {
                    return { success: false, error: resultado.error };
                }
                if (resultado.completado) {
                    completado = true;
                    orderId = resultado.orderId;
                    break;
                }
            }
            await sleep(1000);
        }
        
        if (!completado) {
            const finalUrl = page.url();
            log('⚠️', 'URL final:', finalUrl);
            const screenshotPath = `./debug_${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            log('📸', `Screenshot guardado: ${screenshotPath}`);
            return { success: false, error: 'No se pudo confirmar la compra' };
        }
        
        const elapsed = Date.now() - start;
        log('🎉', `RECARGA COMPLETADA en ${elapsed}ms`);
        log('🧾', `Order ID: ${orderId || 'N/A'}`);
        
        return {
            success: true,
            id_juego: userId,
            zone_id: zoneId,
            diamonds,
            paquete: paquete.nombre,
            precio_usd: paquete.precio,
            order_id: orderId,
            time_ms: elapsed,
            mensaje: `Compra completada - ${orderId || 'OK'}`
        };
        
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

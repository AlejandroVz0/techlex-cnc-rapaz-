/**
 * Cinemática Rapaz — TechLex v3.0 Full-Stack (SQLite + API REST + CORS + QR Lab)
 * Servidor Industrial en Red Local para Web y App Android Externa
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const {
  initDatabase,
  getAllHerramientas,
  getHerramientaByCodigo,
  getVocabulario,
  translateTermSQL,
  registrarEscaneo,
  getHistorialAuditoria
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Habilitar CORS y parseo JSON para consumo desde Web y App Android en Red Local
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Detecta automáticamente la IPv4 local Wi-Fi / LAN física de la computadora
 */
function getLocalWiFiIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('virtual') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vbox') ||
      lowerName.includes('docker') ||
      lowerName.includes('loopback');

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        let priority = 10;
        if (isVirtual) {
          priority = 1;
        } else if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan') || lowerName.includes('inal')) {
          priority = 100;
        } else if (addr.address.startsWith('192.168.')) {
          priority = 80;
        } else if (addr.address.startsWith('10.')) {
          priority = 70;
        }
        candidates.push({ name, address: addr.address, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

/**
 * Normaliza la dirección IP del cliente
 */
function normalizeClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || '127.0.0.1');
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.substring(7);
  }
  if (rawIp === '::1') {
    rawIp = '127.0.0.1';
  }
  return rawIp;
}

// Middleware de Telemetría en Tiempo Real en Consola
app.use((req, res, next) => {
  const now = new Date();
  const timestamp = now.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const clientIP = normalizeClientIP(req);

  if (req.path.startsWith('/api/') || req.path === '/qrs' || req.query.pieza) {
    console.log(
      `\x1b[36m[NET-AUDIT ${timestamp}]\x1b[0m ` +
      `\x1b[33mIP:\x1b[0m ${clientIP.padEnd(15)} | ` +
      `\x1b[32m${req.method.padEnd(4)}\x1b[0m ${req.originalUrl}`
    );
  }
  next();
});

// ============================================================================
// ENDPOINTS REST API CONECTADOS A SQLITE (techlex.db)
// ============================================================================

/**
 * GET /api/info — Información de red local del servidor
 */
app.get('/api/info', (req, res) => {
  const localIP = getLocalWiFiIP();
  res.json({
    ip: localIP,
    port: PORT,
    baseUrl: `http://${localIP}:${PORT}`,
    database: 'SQLite3 (techlex.db)'
  });
});

/**
 * 1) GET /api/herramientas — Devuelve todas las piezas con QR desde SQLite
 */
app.get('/api/herramientas', async (req, res) => {
  try {
    const herramientas = await getAllHerramientas();
    res.json(herramientas);
  } catch (err) {
    console.error('Error en GET /api/herramientas:', err.message);
    res.status(500).json({ error: 'Error al consultar herramientas en SQLite', detalle: err.message });
  }
});

/**
 * 2) GET /api/herramientas/:codigo — Busca una pieza específica por su código QR en SQLite,
 *    la registra automáticamente en historial_escaneos con la IP del cliente y devuelve sus datos.
 */
app.get('/api/herramientas/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo;
    const clientIP = normalizeClientIP(req);
    const herramienta = await getHerramientaByCodigo(codigo);

    if (!herramienta) {
      await registrarEscaneo({
        codigo_o_termino: codigo,
        tipo_accion: 'QR_NO_ENCONTRADO',
        ip_cliente: clientIP
      });
      return res.status(404).json({ error: `No se encontró la herramienta con código ${codigo}` });
    }

    await registrarEscaneo({
      codigo_o_termino: `${herramienta.codigo_qr} (${herramienta.nombre_es} / ${herramienta.nombre_en})`,
      tipo_accion: 'ESCANEO_QR',
      ip_cliente: clientIP
    });

    res.json(herramienta);
  } catch (err) {
    console.error('Error en GET /api/herramientas/:codigo:', err.message);
    res.status(500).json({ error: 'Error al consultar la herramienta en SQLite', detalle: err.message });
  }
});

/**
 * 3) GET /api/vocabulario — Devuelve los 145 términos desde SQLite
 *    Permite filtrar por ?q=texto o ?categoria=nombre con consultas SQL LIKE
 */
app.get('/api/vocabulario', async (req, res) => {
  try {
    const q = req.query.q || '';
    const categoria = req.query.categoria || '';
    const terminos = await getVocabulario({ q, categoria });
    res.json(terminos);
  } catch (err) {
    console.error('Error en GET /api/vocabulario:', err.message);
    res.status(500).json({ error: 'Error al consultar vocabulario en SQLite', detalle: err.message });
  }
});

/**
 * 4) POST /api/traducir — Recibe { texto, idioma }, busca la traducción técnica exacta en SQLite,
 *    guarda el registro en historial_escaneos y devuelve la traducción.
 */
app.post('/api/traducir', async (req, res) => {
  try {
    const { texto = '', idioma = 'auto' } = req.body || {};
    const clientIP = normalizeClientIP(req);
    const resultado = await translateTermSQL({ texto, idioma });

    if (texto && String(texto).trim().length >= 2) {
      await registrarEscaneo({
        codigo_o_termino: `"${String(texto).trim()}" -> "${resultado.traduccion}"`,
        tipo_accion: 'TRADUCCION_CNC',
        ip_cliente: clientIP
      });
    }

    res.json(resultado);
  } catch (err) {
    console.error('Error en POST /api/traducir:', err.message);
    res.status(500).json({ error: 'Error al traducir en SQLite', detalle: err.message });
  }
});

/**
 * 5) GET /api/auditoria — Devuelve los últimos 50 registros de historial_escaneos
 */
app.get('/api/auditoria', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const registros = await getHistorialAuditoria(limit);
    res.json({
      total: registros.length,
      registros
    });
  } catch (err) {
    console.error('Error en GET /api/auditoria:', err.message);
    res.status(500).json({ error: 'Error al obtener historial de auditoría', detalle: err.message });
  }
});

// Endpoint de compatibilidad para imagen QR individual
app.get('/api/qr/:id', async (req, res) => {
  try {
    const localIP = getLocalWiFiIP();
    const toolId = req.params.id.toUpperCase();
    const targetUrl = `http://${localIP}:${PORT}/?pieza=${encodeURIComponent(toolId)}`;
    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 280,
      margin: 1,
      color: { dark: '#0b1326', light: '#ffffff' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).send('Error generando QR');
  }
});

// Ruta /qrs: Planilla lista para imprimir con los 10 códigos QR leídos directamente desde SQLite
app.get('/qrs', async (req, res) => {
  try {
    const localIP = getLocalWiFiIP();
    const clientIP = normalizeClientIP(req);
    const catalogo = await getAllHerramientas();

    await registrarEscaneo({
      codigo_o_termino: 'Planilla de 10 Códigos QR (/qrs)',
      tipo_accion: 'IMPRESION_QRS',
      ip_cliente: clientIP
    });

    const cardsHtml = await Promise.all(
      catalogo.map(async (tool) => {
        const url = `http://${localIP}:${PORT}/?pieza=${tool.codigo_qr}`;
        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 240,
          margin: 1,
          color: { dark: '#0b1326', light: '#ffffff' }
        });

        return `
        <div class="qr-card">
          <div class="qr-header">
            <span class="tool-code">${tool.codigo_qr}</span>
            <span class="tool-norm">${tool.norma}</span>
          </div>
          <img src="${qrDataUrl}" alt="QR ${tool.codigo_qr}" class="qr-img" />
          <div class="tool-info">
            <h2>${tool.nombre_es}</h2>
            <p class="langs">
              🇬🇧 ${tool.nombre_en}<br/>
              🇩🇪 ${tool.idiomas?.de?.nombre || ''}<br/>
              🇫🇷 ${tool.idiomas?.fr?.nombre || ''}
            </p>
            <span class="category-badge">${tool.clasificacion}</span>
            <a href="/?pieza=${tool.codigo_qr}" class="qr-url">${url}</a>
          </div>
        </div>`;
      })
    );

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Planilla de Códigos QR — Cinemática Rapaz TechLex</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Space Grotesk', sans-serif; background: #0b1326; color: #dae2fd; padding: 24px; }
    .top-bar {
      max-width: 1200px; margin: 0 auto 24px auto; background: #131b2e; border: 1px solid #2d3449;
      border-radius: 12px; padding: 18px 24px; display: flex; flex-wrap: wrap; align-items: center;
      justify-content: space-between; gap: 16px;
    }
    .top-bar h1 { font-size: 22px; color: #ffc174; }
    .top-bar p { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7bd0ff; margin-top: 4px; }
    .actions { display: flex; gap: 12px; }
    .btn {
      font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; padding: 10px 18px;
      border-radius: 8px; border: none; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-print { background: #f59e0b; color: #2a1700; }
    .btn-back { background: #222a3d; color: #dae2fd; border: 1px solid #534434; }
    .qr-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
    .qr-card {
      background: #ffffff; color: #0b1326; border: 2px solid #cbd5e1; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; align-items: center; text-align: center;
      box-shadow: 0 8px 20px rgba(0,0,0,0.35); page-break-inside: avoid;
    }
    .qr-header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }
    .tool-code { background: #0b1326; color: #ffc174; padding: 3px 7px; border-radius: 4px; }
    .tool-norm { background: #e2e8f0; color: #0f172a; padding: 3px 7px; border-radius: 4px; }
    .qr-img { width: 165px; height: 165px; object-fit: contain; margin: 4px 0 8px 0; }
    .tool-info h2 { font-size: 15px; font-weight: 700; color: #0b1326; margin-bottom: 4px; }
    .langs { font-size: 11px; color: #334155; line-height: 1.35; margin-bottom: 8px; }
    .category-badge { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; background: #f1f5f9; color: #0f172a; padding: 3px 8px; border-radius: 999px; margin-bottom: 6px; }
    .qr-url { display: block; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #0284c7; word-break: break-all; text-decoration: none; }
    @media print {
      body { background: #ffffff; color: #000000; padding: 0; }
      .top-bar { display: none; }
      .qr-grid { grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .qr-card { box-shadow: none; border: 1.5px solid #000000; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <h1>Cinemática Rapaz — Planilla de 10 Códigos QR (SQLite DB)</h1>
      <p>Servidor API REST Activo: http://${localIP}:${PORT} · Escanea desde Web o App Android</p>
    </div>
    <div class="actions">
      <a href="/" class="btn btn-back">← Volver al Escáner</a>
      <button onclick="window.print()" class="btn btn-print">🖨️ Imprimir Planilla QR</button>
    </div>
  </div>
  <div class="qr-grid">
    ${cardsHtml.join('\n')}
  </div>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send('Error generando la página de códigos QR: ' + err.message);
  }
});

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar base de datos SQLite y arrancar el servidor
initDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      const localIP = getLocalWiFiIP();
      console.log('\n================================================================================');
      console.log(' 🚀 CINEMÁTICA RAPAZ — TECHLEX v3.0 FULL-STACK (SQLite + API REST + CORS)');
      console.log('================================================================================');
      console.log(` 🌐 Web App Local:                http://localhost:${PORT}`);
      console.log(` 📡 Acceso Red Local (Wi-Fi/LAN): http://${localIP}:${PORT}`);
      console.log(` 🖨️  Planilla de 10 Códigos QR:    http://${localIP}:${PORT}/qrs`);
      console.log(` 🔗 API Herramientas QR:          http://${localIP}:${PORT}/api/herramientas`);
      console.log(` 🔗 API Vocabulario CNC (SQL):    http://${localIP}:${PORT}/api/vocabulario`);
      console.log(` 🔗 API Traductor CNC (POST):     http://${localIP}:${PORT}/api/traducir`);
      console.log(` 🔗 API Auditoría en Vivo:        http://${localIP}:${PORT}/api/auditoria`);
      console.log('================================================================================\n');
    });
  })
  .catch((err) => {
    console.error('Error fatal al inicializar SQLite:', err);
    process.exit(1);
  });

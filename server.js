/**
 * Cinemática Rapaz — TechLex v2.4-IND
 * Servidor Industrial en Red Local (Express + QRCode + Telemetría de Red y Ciberseguridad)
 */

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Cargar catálogo de herramientas para enriquecer los logs y la ruta /qrs
const catalogoPath = path.join(__dirname, 'public', 'catalogo.json');
let catalogo = [];
let vocabularioCNC = [];
try {
  const rawData = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));
  catalogo = Array.isArray(rawData) ? rawData : (rawData.herramientasQR || []);
  vocabularioCNC = Array.isArray(rawData) ? [] : (rawData.vocabularioCNC || []);
} catch (err) {
  console.error('Error al leer public/catalogo.json:', err.message);
}

/**
 * Detecta automáticamente la IPv4 local Wi-Fi / LAN física de la computadora,
 * priorizando adaptadores Wi-Fi/WLAN sobre adaptadores virtuales (WSL, Hyper-V, VirtualBox).
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

// Normaliza la dirección IP del cliente para mostrarla limpia en consola
function normalizeClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || 'Desconocida');
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.substring(7);
  }
  if (rawIp === '::1') {
    rawIp = '127.0.0.1 (Localhost)';
  }
  return rawIp;
}

// Middleware de Telemetría y Auditoría en Tiempo Real (Demostración de Redes y Ciberseguridad)
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
  const piezaId = req.query.pieza || req.query.id || (req.path.startsWith('/api/qr/') ? req.path.split('/').pop() : null);
  const lang = req.query.lang ? req.query.lang.toUpperCase() : null;

  let toolLabel = 'Navegación General / Recurso Estático';
  if (piezaId) {
    const found = catalogo.find(t => t.id.toUpperCase() === String(piezaId).toUpperCase());
    if (found) {
      toolLabel = `${found.id} — ${found.idiomas.es.nombre} [${found.norma} | ${found.categoria}]${lang ? ` (Idioma: ${lang})` : ''}`;
    } else {
      toolLabel = `Código solicitado: ${piezaId}`;
    }
  } else if (req.path === '/qrs') {
    toolLabel = 'Generación de Planilla de 10 Códigos QR (/qrs)';
  }

  // Filtrar peticiones secundarias menores para destacar las consultas relevantes o mostrar todo con claridad
  console.log(
    `\x1b[36m[NET-AUDIT ${timestamp}]\x1b[0m ` +
    `\x1b[33mIP Cliente:\x1b[0m ${clientIP.padEnd(16)} | ` +
    `\x1b[32m${req.method}\x1b[0m ${req.originalUrl.padEnd(28)} | ` +
    `\x1b[35mHerramienta:\x1b[0m ${toolLabel}`
  );

  next();
});

// Endpoint de información de red local para la interfaz frontend
app.get('/api/info', (req, res) => {
  const localIP = getLocalWiFiIP();
  res.json({
    ip: localIP,
    port: PORT,
    baseUrl: `http://${localIP}:${PORT}`
  });
});

// Endpoint ligero para registrar en consola cada cambio de herramienta o idioma desde la SPA
app.get('/api/log', (req, res) => {
  res.json({ status: 'logged', timestamp: new Date().toISOString() });
});

// Endpoint que genera en vivo la imagen PNG del código QR de cualquier herramienta
app.get('/api/qr/:id', async (req, res) => {
  try {
    const localIP = getLocalWiFiIP();
    const toolId = req.params.id.toUpperCase();
    const targetUrl = `http://${localIP}:${PORT}/?pieza=${encodeURIComponent(toolId)}`;
    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 280,
      margin: 1,
      color: {
        dark: '#0b1326',
        light: '#ffffff'
      }
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).send('Error generando QR');
  }
});

// Ruta /qrs: Página lista para imprimir con los 10 códigos QR apuntando a http://<IP_LOCAL>:3000/?pieza=<ID_HERRAMIENTA>
app.get('/qrs', async (req, res) => {
  try {
    const localIP = getLocalWiFiIP();
    const cardsHtml = await Promise.all(
      catalogo.map(async (tool) => {
        const url = `http://${localIP}:${PORT}/?pieza=${tool.id}`;
        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 240,
          margin: 1,
          color: {
            dark: '#0b1326',
            light: '#ffffff'
          }
        });

        return `
        <div class="qr-card">
          <div class="qr-header">
            <span class="tool-code">${tool.id}</span>
            <span class="tool-norm">${tool.norma}</span>
          </div>
          <img src="${qrDataUrl}" alt="QR ${tool.id}" class="qr-img" />
          <div class="tool-info">
            <h2>${tool.idiomas.es.nombre}</h2>
            <p class="langs">
              🇬🇧 ${tool.idiomas.en.nombre}<br/>
              🇩🇪 ${tool.idiomas.de.nombre}<br/>
              🇫🇷 ${tool.idiomas.fr.nombre}
            </p>
            <span class="category-badge">${tool.categoria} · ${tool.especificaciones.rango}</span>
            <a href="/?pieza=${tool.id}" class="qr-url">${url}</a>
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
    body {
      font-family: 'Space Grotesk', sans-serif;
      background: #0b1326;
      color: #dae2fd;
      padding: 24px;
    }
    .top-bar {
      max-width: 1200px;
      margin: 0 auto 24px auto;
      background: #131b2e;
      border: 1px solid #2d3449;
      border-radius: 12px;
      padding: 18px 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .top-bar h1 {
      font-size: 22px;
      color: #ffc174;
    }
    .top-bar p {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #7bd0ff;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .btn {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-print {
      background: #f59e0b;
      color: #2a1700;
    }
    .btn-back {
      background: #222a3d;
      color: #dae2fd;
      border: 1px solid #534434;
    }
    .qr-grid {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 18px;
    }
    .qr-card {
      background: #ffffff;
      color: #0b1326;
      border: 2px solid #cbd5e1;
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 8px 20px rgba(0,0,0,0.35);
      page-break-inside: avoid;
    }
    .qr-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
    }
    .tool-code {
      background: #0b1326;
      color: #ffc174;
      padding: 3px 7px;
      border-radius: 4px;
    }
    .tool-norm {
      background: #e2e8f0;
      color: #0f172a;
      padding: 3px 7px;
      border-radius: 4px;
    }
    .qr-img {
      width: 165px;
      height: 165px;
      object-fit: contain;
      margin: 4px 0 8px 0;
    }
    .tool-info h2 {
      font-size: 16px;
      font-weight: 700;
      color: #0b1326;
      margin-bottom: 4px;
    }
    .langs {
      font-size: 11px;
      color: #334155;
      line-height: 1.35;
      margin-bottom: 8px;
    }
    .category-badge {
      display: inline-block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      background: #f1f5f9;
      color: #0f172a;
      padding: 3px 8px;
      border-radius: 999px;
      margin-bottom: 6px;
    }
    .qr-url {
      display: block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
      color: #0284c7;
      word-break: break-all;
      text-decoration: none;
    }
    @media print {
      body {
        background: #ffffff;
        color: #000000;
        padding: 0;
      }
      .top-bar {
        display: none;
      }
      .qr-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .qr-card {
        box-shadow: none;
        border: 1.5px solid #000000;
      }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <h1>Cinemática Rapaz — Planilla de 10 Códigos QR Industriales</h1>
      <p>Servidor Activo en Red Local Wi-Fi: http://${localIP}:${PORT} · Escanea con cualquier celular en la misma red</p>
    </div>
    <div class="actions">
      <a href="/" class="btn btn-back">← Volver al Inspector 3D</a>
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

// Arrancar el servidor escuchando en toda la red local (0.0.0.0)
app.listen(PORT, HOST, () => {
  const localIP = getLocalWiFiIP();
  console.log('\n================================================================================');
  console.log(' 🚀 CINEMÁTICA RAPAZ — TECHLEX v2.4-IND | SERVIDOR INDUSTRIAL ACTIVO');
  console.log('================================================================================');
  console.log(` 🌐 Acceso Local (Esta PC):       http://localhost:${PORT}`);
  console.log(` 📡 Acceso Red Local (Wi-Fi/LAN): http://${localIP}:${PORT}`);
  console.log(` 🖨️  Planilla de 10 Códigos QR:    http://${localIP}:${PORT}/qrs`);
  console.log('--------------------------------------------------------------------------------');
  console.log(' 🛡️  MONITOR DE RED Y CIBERSEGURIDAD ACTIVO — Esperando peticiones...');
  console.log('================================================================================\n');
});

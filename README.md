# Cinemática Rapaz — TechLex CNC

Aplicación web industrial de traducción técnica y escaneo visual de herramientas de **Fresado CNC** en tiempo real (estilo Google Lens), con soporte de voz (`Web Speech API`), visor CAD/3D y generación de códigos QR en red local.

## 🚀 Instalación y Ejecución

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/AlejandroVz0/techlex-cnc-rapaz.git
   cd techlex-cnc-rapaz
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Iniciar el servidor:
   ```bash
   npm start
   ```

4. Abrir en el navegador:
   - **Aplicación Principal (Escáner QR & Traductor CNC):** `http://localhost:3000`
   - **Planilla Imprimible de 10 Códigos QR:** `http://localhost:3000/qrs`

---

## 📋 Estructura del Proyecto y API REST (SQLite)

- `database.js`: Inicializador de la base de datos relacional **SQLite (`techlex.db`)** con las 3 tablas (`herramientas_qr`, `vocabulario_cnc`, `historial_escaneos`) y *auto-seed* automático.
- `server.js`: Servidor Express con **CORS** habilitado en red local (`0.0.0.0:3000`) para consumo desde Web y App Android:
  - `GET /api/herramientas`: Lista las 10 herramientas con QR desde SQLite.
  - `GET /api/herramientas/:codigo`: Obtiene una pieza por su código QR y registra el escaneo con la IP del cliente en `historial_escaneos`.
  - `GET /api/vocabulario`: Lista los 145 términos oficiales del PDF (filtrable con `?q=texto` y `?categoria=nombre` mediante SQL `LIKE`).
  - `POST /api/traducir`: Recibe `{ texto, idioma }`, consulta la traducción técnica en SQLite, la registra en `historial_escaneos` y devuelve el resultado.
  - `GET /api/auditoria`: Devuelve los últimos 50 registros de `historial_escaneos` en tiempo real.
- `public/index.html` y `public/app.js`: Frontend conectado a los endpoints REST del Backend.

---

## 🛠️ Lista de Módulos Pendientes para el Equipo

- [ ] **Modelos 3D (`.glb` / `.gltf`)**: Integrar archivos 3D reales en `<model-viewer>` para las 10 herramientas principales del catálogo.
- [ ] **Fotografías de Taller**: Agregar fotografías reales tomadas en el laboratorio de manufactura CNC para cada herramienta.
- [ ] **Modo Offline / PWA (`Service Worker` + `manifest.json`)**: Permitir que la aplicación funcione en celulares dentro del taller sin conexión constante.
- [ ] **Panel de Estadísticas de Red y Ciberseguridad**: Vista visual en el navegador con el historial de IPs clientes y herramientas más escaneadas.
- [ ] **Ampliación de Idiomas en el Glosario CNC**: Extender los 145 términos del PDF con equivalencias en Alemán (`DE`) y Francés (`FR`).

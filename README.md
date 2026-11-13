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

## 📋 Estructura del Proyecto

- `server.js`: Servidor Express en red local (`0.0.0.0:3000`), autodetección de IP Wi-Fi/LAN, auditoría en consola en tiempo real (`[NET-AUDIT]`) y generador de códigos QR (`/qrs`).
- `public/index.html`: Interfaz responsiva dividida en 2 pestañas (`Escáner Lens QR` y `Traductor Técnico CNC`).
- `public/app.js`: Lógica de lectura QR con `html5-qrcode`, síntesis de voz bilingüe (ES/EN), modal CAD/3D y motor de traducción técnica industrial.
- `public/catalogo.json`: Base de datos con las 10 herramientas principales con QR y los 145 términos oficiales de Fresado CNC extraídos de `VOCABULARIO.pdf`.

---

## 🛠️ Lista de Módulos Pendientes para el Equipo

- [ ] **Modelos 3D (`.glb` / `.gltf`)**: Integrar archivos 3D reales en `<model-viewer>` para las 10 herramientas principales del catálogo.
- [ ] **Fotografías de Taller**: Agregar fotografías reales tomadas en el laboratorio de manufactura CNC para cada herramienta.
- [ ] **Modo Offline / PWA (`Service Worker` + `manifest.json`)**: Permitir que la aplicación funcione en celulares dentro del taller sin conexión constante.
- [ ] **Panel de Estadísticas de Red y Ciberseguridad**: Vista visual en el navegador con el historial de IPs clientes y herramientas más escaneadas.
- [ ] **Ampliación de Idiomas en el Glosario CNC**: Extender los 145 términos del PDF con equivalencias en Alemán (`DE`) y Francés (`FR`).

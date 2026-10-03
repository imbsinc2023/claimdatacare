# ClaimDataCare • Pruebas automáticas

Tres niveles, todos con datos ficticios y sin conexión a servicios reales (Firebase, ClaimMD, USPS y el email se simulan en memoria):

| Nivel | Carpeta | Qué prueba |
|---|---|---|
| Componentes | `unit/` | Cada pieza sola: seguridad (escape, URLs, neutralizador, auditoría), validación de login (email, contraseña, edad), guardia de red (HTTPS, límites), Workers (origen, HTTPS, tamaño, 429) |
| Integración | `integration/` | La app completa con la nube simulada: inicio de sesión, roles desde la nube, menores, sesión manipulada, datos maliciosos, auditoría, enlaces de reset, administración de usuarios |
| End-to-end | `e2e/` | Recorridos reales con clics: registrar paciente y cerrar sesión, olvidé mi contraseña completo, cierre por inactividad (15 min), F5, crear usuario |

## Cómo correrlas (en tu Mac)

Necesitas Node.js 18 o superior.

```bash
cd tests
npm install
npx playwright install chromium   # solo la primera vez
npm test                           # todo
npm run test:unit                  # solo componentes
npm run test:integration
npm run test:e2e
```

El resultado queda en `tests/report/REPORT.md`. Si una prueba falla, el reporte dice cuál y por qué.

## Reglas

* Correr `npm test` antes de cada subida al repo; si algo falla, no subir.
* Las pruebas usan los archivos `.js` publicados (los mismos que ve el usuario).
* No subir `tests/node_modules` ni `tests/report` al repo.
* La carpeta `tests/` no se publica en el sitio (`.vercelignore`).

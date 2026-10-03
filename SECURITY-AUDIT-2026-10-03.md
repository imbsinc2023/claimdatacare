# ClaimDataCare • Auditoría de seguridad y HIPAA (3 oct 2026)

Hecha con las skills de *Anthropic-Cybersecurity-Skills*: `implementing-hipaa-security-rule-safeguards`, `implementing-secret-scanning-with-gitleaks`, `implementing-semgrep-for-custom-sast-rules`, `exploiting-prototype-pollution-in-javascript` (revisión de código), `performing-cryptographic-audit-of-application` y `performing-security-headers-audit` (revisión de configuración). Solo revisión defensiva del código y la configuración propios; no se atacó el sitio en vivo.

## 1. Secretos en el historial del repo (gitleaks, 553 commits)

| Hallazgo | Riesgo | Acción |
|---|---|---|
| API key del proyecto Firebase actual `claimdatacare-451fe` (35 apariciones) | Bajo por sí sola (es pública por diseño en apps web); el riesgo real son las reglas de Firestore | Restringirla en Google Cloud a `https://claimdatacare.com/*` y publicar `firestore.rules` |
| **Otra API key de un proyecto Firebase anterior `claimdatacare`** (abril-mayo 2026, en `app.html`/`index.html` del historial) | **Alto si ese proyecto todavía existe con datos** y reglas abiertas | Revisar en Firebase console si el proyecto `claimdatacare` existe: si no se usa, **eliminarlo**; si tiene datos, cerrar sus reglas y restringir la key |
| Sin claves de ClaimMD, USPS ni tokens en el código | OK | Las claves de ClaimMD viven en los registros de proveedor (pasar al servidor en Fase 2) |

El repo sigue **público**: todo el historial (incluida la key vieja) es descargable. Ponerlo en privado.

## 2. Análisis estático (Semgrep, reglas propias)

| Regla | Hallazgos | Estado |
|---|---|---|
| Código creado desde texto (`new Function`) | 1 | **Eliminado** |
| Contraseñas/tokens con `btoa` (base64, no es cifrado) | 6 | Los 4 de los portales públicos **eliminados** con los portales; los 2 del login solo sirven para migrar cuentas viejas a Firebase (ya no abren sesión sin Firebase) |
| `window.open` que deja acceso a la app (`opener`) | 3 + 2 ventanas de impresión | **Corregido** (`noopener` / `opener = null`) |
| `innerHTML` con datos dinámicos | 259 | Mitigado en el origen: todo dato leído o guardado en la nube pasa por el neutralizador de campos de identidad (nombres, emails, pagador...), `toast()` ahora escapa, y las pantallas de notas, comentarios, intake y usuarios escapan la salida. Verificado: nombres con código malicioso se muestran como texto |
| Prototype pollution (merge de JSON externo) | 0 | OK |
| `postMessage` sin verificar origen | 0 | OK |

## 3. Criptografía

* Transporte: TLS en todas las conexiones; la app bloquea cualquier petición que no sea HTTPS (cdc-guard).
* En reposo: Firestore y Storage cifran con AES-256 (Google). No se guarda PHI en el navegador.
* Contraseñas: solo en Firebase Auth (hash scrypt de Google); política fuerte de 12+ caracteres.
* Tokens: códigos 2FA con generador seguro del navegador; enlaces de reset de Firebase (un solo uso, 1 hora).
* Pendiente: el código 2FA se verifica en el navegador; MFA real con Firebase Identity Platform (TOTP).

## 4. HIPAA Security Rule • Evaluación de brechas (scorer de la skill)

* **Rol:** IMBS Inc es Business Associate de las prácticas; ClaimDataCare procesa su ePHI.
* **Preparación ponderada: 31 %** • 18 brechas en especificaciones *required*, 16 en *addressable*.
* **Prioridad OCR:** no existe un **Análisis de Riesgo** documentado (164.308(a)(1)(ii)(A)). Es lo primero que pide la OCR.

| Sección | Implementado | Parcial | Brecha |
|---|---|---|---|
| Administrativas (164.308) | 0 | 11 | 11 |
| Físicas (164.310) | 0 | 3 | 4 |
| Técnicas (164.312) | 4 | 4 | 1 |

Lo técnico está casi cubierto con el código de estas semanas (usuario único, cierre automático, cifrado en tránsito, auditoría central). Lo que falta es **documentación y procesos**: análisis de riesgo, políticas, respuesta a incidentes, respaldo/recuperación, BAAs, capacitación.

### Plan de remediación (orden)

1. **Análisis de Riesgo** con la herramienta SRA gratuita de HHS (HealthIT.gov). 30 días.
2. **Plan de Gestión de Riesgos** que salga de ese análisis. 45 días.
3. **BAAs**: Google Cloud/Firebase (aceptar en consola), ClaimMD, Vercel o Cloudflare, proveedor de email; y con cada práctica cliente. 30 días.
4. **Políticas escritas**: sanciones, uso y seguridad de estaciones de trabajo, eliminación de equipos y medios, acceso de emergencia, respuesta a incidentes y notificación de brechas. 45 días.
5. **Respaldo y recuperación**: activar Point-in-Time Recovery y exportaciones programadas de Firestore; probar una restauración. 60 días.
6. **Responsable de seguridad** nombrado por escrito y **capacitación** anual del equipo con registro. 30 días.
7. **Revisión de actividad**: revisar el registro de auditoría cada mes (pantalla Audit Log) y dejar constancia.
8. **MFA real** (Firebase Identity Platform) y **evaluación** anual (escaneo de vulnerabilidades y prueba de penetración).

> La propuesta de cambio de la HIPAA Security Rule (NPRM de enero 2025) haría obligatorios MFA, cifrado en reposo y tránsito, inventario de activos, escaneos cada 6 meses y prueba de penetración anual. **Es una propuesta, no regla vigente**; conviene prepararse.

## 5. Despliegue de esta entrega

1. Subir los archivos modificados (lista en el mensaje).
2. Entrar como Super Admin una vez (crea `userRoles`).
3. Poner tu UID en `firestore.rules` y `storage.rules` y publicarlas en Firebase.
4. Borrar del repo `intake.html` y `eval.html` (siguen ahí) y crear `.vercelignore`.

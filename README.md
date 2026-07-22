# Reporte Detallado de Conexiones y Gestiones

Dashboard HTML interactivo para el equipo de retención universitaria. Se sube el Excel mensual de Genesys y el reporte completo se genera **100% en el navegador**: nada se envía a ningún servidor.

## Qué incluye

- **Resumen ejecutivo**: KPIs de gestión, contactabilidad, adherencia y horas de conexión.
- **Tendencias**: gestión total y contactabilidad día a día, distribución por canal.
- **Adherencia**: adherencia diaria ponderada + panel de insights/alertas automáticas.
- **Alianzas & Coach**: tablas de desempeño por alianza y por equipo de coaching.
- **Top agentes**: ranking de los 10 agentes con mayor gestión total.
- **Conexión & puntualidad**: cumplimiento de horas, distribución de puntualidad, top 10 con más retardos, y tabla detallada de hora programada vs. hora real.
- **Asistente de datos**: chat en español que responde preguntas sobre los datos ya cargados. **Es un motor de reglas 100% en el navegador — no usa IA ni se conecta a ninguna API.**
- **Detalle de gestiones**: tabla paginada (25 filas), ordenable, con buscador y exportación a CSV del subconjunto filtrado.

Todo el dashboard se recalcula en vivo con los filtros globales (alianza, coach, rango de fechas, agente).

## Estructura de archivos

```
├── index.html              → página principal (pantalla de carga + dashboard)
├── css/
│   └── styles.css          → estilos (tema azul marino)
├── js/
│   ├── xlsx.full.min.js    → librería SheetJS (lectura de Excel en el navegador)
│   ├── utils.js            → utilidades de formato y fechas
│   ├── parser.js           → lectura y normalización del Excel
│   ├── aggregates.js       → cálculos de KPIs y agrupaciones
│   ├── charts.js           → gráficos SVG dibujados a mano
│   ├── assistant.js        → motor de reglas del asistente de datos
│   └── app.js               → estado, filtros y renderizado de las vistas
└── README.md
```

No hay build, ni Node, ni frameworks: son archivos estáticos que cualquier navegador puede abrir.

## Cómo usarlo

1. Abre `index.html` (localmente o publicado en GitHub Pages, ver abajo).
2. Arrastra el Excel del mes (`.xlsx` o `.xlsm`) a la zona de carga, o haz clic en **"Elegir archivo"**.
3. El archivo debe tener una hoja llamada **"BDD Estados"** (Genesys). El parser busca las columnas por su nombre, así que tolera que el orden de las columnas cambie de un mes a otro — pero los nombres de encabezado deben mantenerse.
4. Cuando termine de procesar, el dashboard completo aparece automáticamente.
5. Para cargar el archivo de otro mes, usa el botón **"Cargar otro archivo"** en la parte inferior del menú lateral.

### Notas sobre los datos

- Solo se manejan dos canales: **llamadas de voz** y **WhatsApp**. No hay SMS ni Email.
- No hay datos de motivo de contacto, disposición ni resultado (retenido/no retenido) a nivel de estudiante — el dashboard no los muestra porque la fuente no los trae.
- Los nombres de alianza con variantes o errores de tipeo (ej. "CONTINENTAL Especializaciones/Maestrías") se normalizan automáticamente a un nombre único (ej. "CONTINENTAL"). Cuando una fila combina varias alianzas reales en un solo valor (ej. "ROSARIO/UNIBE"), se conserva como una categoría propia en vez de dividirla, para no inventar datos que el archivo no separa.
- Si el archivo trae registros con **Agente = "#N/A"**, se renombran a "Agente sin identificar": se cuentan en los KPIs y totales generales, pero se excluyen de los rankings por agente. El dashboard muestra una nota transparente con el porcentaje exacto cada vez que esto ocurre — en algunos archivos fuente este porcentaje puede ser mucho mayor al esperado si la fórmula de búsqueda de coach/Agente/Alianza no se recalculó antes de guardar el Excel; conviene revisar ese archivo en Genesys/Excel (recalcular fórmulas con F9 y volver a guardar) si el porcentaje reportado es alto.

## Publicarlo en GitHub Pages (paso a paso)

No necesitas saber Git a fondo; sigue estos pasos tal cual.

### 1. Crea un repositorio en GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Haz clic en el botón **"+"** (arriba a la derecha) → **"New repository"**.
3. Ponle un nombre, por ejemplo `reporte-conexiones-gestiones`.
4. Déjalo en **Public** (GitHub Pages gratuito requiere que el repositorio sea público, salvo que tengas GitHub Pro/Enterprise).
5. No marques ninguna casilla de "Add a README" (para no generar conflictos). Haz clic en **"Create repository"**.

### 2. Sube los archivos de este ZIP

**Opción A — Sin usar la terminal (más fácil):**

1. Descomprime este ZIP en tu computador.
2. En la página del repositorio recién creado en GitHub, haz clic en **"uploading an existing file"** (o el botón **"Add file" → "Upload files"**).
3. Arrastra **todo el contenido de la carpeta descomprimida** (el archivo `index.html`, la carpeta `css/`, la carpeta `js/` y `README.md`) — importante: sube el *contenido* de la carpeta, no la carpeta en sí, para que `index.html` quede en la raíz del repositorio.
4. Baja hasta el final de la página y haz clic en **"Commit changes"**.

**Opción B — Con Git en la terminal:**

```bash
cd ruta/donde-descomprimiste-el-zip
git init
git add .
git commit -m "Primera versión del reporte"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/reporte-conexiones-gestiones.git
git push -u origin main
```

### 3. Activa GitHub Pages

1. En tu repositorio, ve a **"Settings"** (pestaña superior).
2. En el menú de la izquierda, haz clic en **"Pages"**.
3. En **"Build and deployment" → "Source"**, elige **"Deploy from a branch"**.
4. En **"Branch"**, selecciona **`main`** y la carpeta **`/ (root)`**. Haz clic en **"Save"**.
5. Espera 1–2 minutos. GitHub mostrará un mensaje como: *"Your site is live at https://TU-USUARIO.github.io/reporte-conexiones-gestiones/"*.
6. Entra a esa URL — deberías ver la pantalla de carga del reporte.

### 4. Verifica que no se "descuadre"

- Confirma que `index.html` haya quedado en la **raíz** del repositorio (no dentro de una subcarpeta extra). Si en la URL de Pages ves un error 404, casi siempre es porque `index.html` terminó dentro de una carpeta como `reporte-conexiones-gestiones/reporte-conexiones-gestiones/index.html`.
- Las carpetas `css/` y `js/` deben estar al mismo nivel que `index.html`.
- No cambies los nombres de los archivos ni de las carpetas; el HTML los referencia por esa ruta exacta.
- Cada vez que subas un archivo de un mes nuevo, no necesitas volver a publicar nada en GitHub: el Excel se carga desde tu computador directamente en el navegador, no desde el repositorio.

### 5. Actualizaciones futuras

Si en algún momento modificas el código (por ejemplo, agregar una columna nueva), repite el paso 2 (subir/hacer commit de los archivos cambiados) — GitHub Pages se actualiza solo, en 1–2 minutos, sin pasos adicionales.

## Solución de problemas

| Problema | Causa probable |
|---|---|
| "No se encontró la hoja BDD Estados" | El archivo subido no es el correcto, o la hoja fue renombrada. |
| "Faltan columnas obligatorias" | Cambiaron o borraron encabezados de columna en el Excel fuente. |
| El sitio de GitHub Pages muestra 404 | `index.html` no quedó en la raíz del repositorio (ver paso 4 arriba). |
| El navegador se congela un momento al cargar | Es normal con archivos grandes (miles de filas); espera a que termine la barra de progreso. |

# Tomasulo Web

Port a web (TypeScript + Canvas) de **Tomasulo-Visual**, un simulador ciclo a
ciclo del algoritmo de Tomasulo (planificación dinámica fuera de orden:
Issue → Execute → Write Back). Pensado para desplegarse en **GitHub Pages**.

La aplicación original de escritorio (Java Swing) se conserva como referencia en
[`reference-java/`](reference-java/); su motor no puede ejecutarse en un
navegador, por eso el motor de simulación fue **reescrito en TypeScript**
replicando ciclo a ciclo el comportamiento del original.

## Características

- **Selector de ejemplos**: los programas `.s` incluidos se eligen desde un
  desplegable. También se puede cargar un archivo `.s` propio.
- **Controles**: paso a paso (1 ciclo), multi-paso configurable, ejecutar todo,
  reiniciar.
- **Diagrama en Canvas** con el estado de cada instrucción en el pipeline.
- **Tabla de tiempos** accesible (Issue / Exe / Write Back) y lista de registros
  ocupados — alternativa textual al canvas para lectores de pantalla.

## Fidelidad del motor

El motor TypeScript (`web/src/engine/`) es un port estructural de
`MainLogic.java`. Se valida contra la salida del motor Java de referencia
(`HeadlessTest`) para los 7 programas de ejemplo: la tabla de tiempos por
instrucción y el número total de ciclos coinciden **exactamente**.

```
npm test    # en web/  → 7/7 samples match the Java golden output
```

Nota: los *valores* numéricos de registros/memoria no son reproducibles porque
el motor Java inicializa la memoria con valores aleatorios; sólo se verifica la
temporización (que es lo relevante para Tomasulo).

## Estructura

```
web/                 # aplicación web (TypeScript + Vite)
  src/engine/        # port del motor (mainLogic.ts, parseFile.ts)
  src/               # UI: main.ts, diagram.ts, examples.ts, style.css
  public/asm/        # corpus de ejemplos .s (assets estáticos)
  test/              # test de fidelidad vs golden de Java
reference-java/      # app original Java Swing (referencia, no se ejecuta en web)
.github/workflows/   # despliegue a GitHub Pages
```

## Desarrollo

```bash
cd web
npm install
npm run dev       # servidor de desarrollo
npm test          # test de fidelidad
npm run build     # build de producción (VITE_BASE=/tomasulo-web/ en CI)
```

## Despliegue

Cada push a `main` dispara el workflow de GitHub Actions
(`.github/workflows/deploy.yml`), que corre los tests, construye con la base
`/tomasulo-web/` y publica en GitHub Pages. Habilitá Pages con origen
**GitHub Actions** en la configuración del repositorio.

URL: `https://agustin130a.github.io/tomasulo-web/`

## Créditos

Basado en Tomasulo-Visual (proyecto de curso UMass ENG668). Este repositorio es
un port web con fines educativos.

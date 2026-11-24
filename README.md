# Aroscopio

Probabilidades y estadísticas de la NBA, explicadas con datos. Nada de horóscopo.

## Qué hay en esta carpeta

- `index.html`, `estilos.css`, `app.js`: la web.
- `data/`: los datos que muestra la web. Se actualizan solos todos los días.
- `scripts/actualizar.mjs`: el programa que baja los partidos y calcula las probabilidades.
- `.github/workflows/actualizar.yml`: la tarea automática que corre ese programa todos los días.

## Cómo funciona

1. Todos los días a las 10:17 (hora de Argentina), GitHub corre el programa.
2. El programa baja los partidos de la temporada desde BALLDONTLIE (plan gratis).
3. Calcula la fuerza de cada equipo (sistema Elo), la ventaja de local y el cansancio.
4. Guarda los partidos de ayer, hoy y mañana en `data/hoy.json`.
5. Guarda las predicciones de hoy en `data/historial.json`, antes de que se jueguen.
6. GitHub Pages publica la web con los datos nuevos.

## Parámetros del modelo

Están al principio de `scripts/actualizar.mjs`: ventaja de local (100 puntos Elo), castigo por cansancio (40), velocidad de ajuste (K = 20) y cuánto se conserva entre temporadas (75%).

# Models and credits

## Slime

- **Slime** by **Quaternius**.
- Source: https://poly.pizza/m/LyjSUKHKnh
- Licence: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- File: `assets/enemies/slime.glb`.
- In-game changes: scale, orientation, and material settings. The original skeletal walk and attack animations are used. The GLB file itself is unchanged.

## Slug

- **Slug** by **Poly by Google**.
- Source: https://poly.pizza/m/6EajmlUIlza
- Licence: **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**, https://creativecommons.org/licenses/by/3.0/
- File: `assets/enemies/slug.glb`.
- In-game changes: scale, position, material settings, and a procedural crawling sway. The geometry and texture in the GLB are unchanged.

Retain the slug's attribution and licence when distributing the game. These licences apply to the respective enemy models, not to the entire project.

## Hero and environment

Bad Bad Boy is a sculpture by Tommi Toija in Helsinki. The game character was prepared from the user-provided `bc222867938641be8050f747614e5d34.glb`; it is not covered by the slime and slug licences above.

The city environment is generated in `city.js`. Three.js: https://threejs.org/ (MIT).

## Included libraries and fonts

- Three.js **0.180.0**, from the official `three@0.180.0` npm package. The included files are unmodified. MIT licence: `vendor/three-0.180.0/LICENSE`.
- Inter, from `@fontsource-variable/inter@5.3.0`. SIL Open Font License: `vendor/fonts/LICENSE-Inter.txt`.
- Barlow Condensed, from `@fontsource/barlow-condensed@5.3.0`. SIL Open Font License: `vendor/fonts/LICENSE-Barlow-Condensed.txt`.

## Asset preparation tools

Uses meshoptimizer 1.3.0. Copyright (c) 2016–2026, Arseny Kapoulkine (MIT). Used offline to simplify and reorder the hero mesh; no decoder is required by the game. Texture preparation uses Sharp 0.34.5 (Apache-2.0).

# Bad Bad Boy: Golden Shower

A browser arcade game starring Helsinki's Bad Bad Boy sculpture. The textured character model is included in the repository: `assets/bad-bad-boy.glb`.

## Run locally

Start a local server from the repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [http://localhost:8000/](http://localhost:8000/). No build step or package installation is needed. Three.js loads from jsDelivr, so the first launch requires an internet connection.

Controls: `WASD` or arrow keys to run and turn; hold the left mouse button or `Space` to spray. The character faces the direction of travel and sprays forward from beneath his joined hands. He keeps his last facing direction when stopped. Touch controls are available on mobile. Hit the approaching enemies to clear waves and earn points.

The character's axes are aligned, and his legs use a skeleton with hip, knee, and ankle joints.

## City and enemies

The game takes place in a small neighbourhood with a cobbled square, pedestrian crossings, tram tracks, cafes, trees, and parked cars. Buildings and street furniture have collision boundaries. Enemies navigate around obstacles using a shared navigation grid. The stream cannot pass through obstacles.

Waves contain fast, animated slimes and slower, tougher snails. A slime is worth 100 points; a snail is worth 150. Both enemy models are free and openly licensed: Slime by Quaternius (CC0) and Snail by Poly by Google (CC BY 3.0). Sources, licences, and modifications are listed in [CREDITS.md](./CREDITS.md) and the in-game Models & credits page.

## Files

- `index.html` and `style.css`: game interface and controls.
- `game.js`: movement, waves, damage, and input.
- `city.js`: environment, collisions, and navigation.
- `enemies.js`: loading and animating the slime and snail models.
- `hero.js`: character rig, animation, and stream emitter.
- `assets/bad-bad-boy.glb`: character without its stand, with UVs and a 2048 × 2048 colour atlas.
- `assets/enemies/`: original enemy GLBs with materials and animations.
- `scripts/prepare-model.mjs`: prepare the game GLB from the source model.

## Prepare the character model

The game model was derived from `bc222867938641be8050f747614e5d34.glb`. The source file incorrectly assigns its 8000 × 8000 colour atlas as a normal map. The preparation script reassigns it to base colour, resizes it to 2048 × 2048, preserves UVs and normals, removes the stand and separate plane, and aligns the model for its skeleton.

To prepare it again, install Node.js and the development dependencies:

```bash
npm ci
npm run prepare-model -- /path/to/bc222867938641be8050f747614e5d34.glb
```

Normal gameplay uses the prepared GLB and does not require installing dependencies.

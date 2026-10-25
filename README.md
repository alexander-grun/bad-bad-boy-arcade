# Bad Bad Boy: Golden Blast

A browser arcade game starring Helsinki's Bad Bad Boy sculpture. The textured character model is included in the repository: `assets/bad-bad-boy.glb`.

## Play online

[Play Golden Blast](https://bekharsky.github.io/bad-bad-boy-arcade/)

GitHub Pages publishes the repository root from the `bekharsky/arcade` branch. Pushing updates to this branch updates the live game. The `.nojekyll` file serves the game and its bundled assets directly without Jekyll processing.

## Run locally

Start a local server from the repository root:

```bash
python3 server.py
```

Open [http://localhost:8000/](http://localhost:8000/). No build step or package installation is needed. Three.js and the fonts are included in `vendor/`, so gameplay does not depend on a CDN or an internet connection. You can also start the server with `npm start`. The server always serves fresh application modules to prevent stale code from different versions being mixed.

Controls: `Up` / `Down` move forward / backward, and `Left` / `Right` smoothly turn the character in place or while moving. A short turn can leave the character facing any angle; releasing the turn key stops rotation immediately. Hold `Shift` for fine aiming with slower turning and movement. Spraying also reduces turning and movement speed for easier tracking. Movement accelerates and brakes smoothly, with animation paced to actual travel. The camera pans with a fixed viewing angle to keep aiming steady.

`WASD` also supports movement toward world directions with smooth turning. Tap the left mouse button or `Space` for nearby enemies, or hold to spray farther. The stream follows the character's actual facing direction from beneath his joined hands, including while reversing. Touch controls provide the same forward, backward, and steering controls as the arrow keys. Hit the approaching enemies to clear waves and earn points.

The character's axes are aligned, and his legs use a skeleton with hip, knee, and ankle joints.
The character reaches the third-floor windows of the map's buildings. His height is three storeys at 1.15 game units each (3.45 total), using the same storey spacing as the facades. The emitter, collision radius, and liquid thickness match this size. The camera frames his full height, and the running animation follows the distance travelled with a stride proportional to his height.

## Loading

The entry point uses one version for all game modules. Startup errors appear above the start button with a retry button instead of leaving the game on an indefinite loading screen. The local server disables caching for JavaScript, HTML, and CSS. A plain static server still works; use the included server during development to keep modules fresh.

## Liquid stream

A tap sends a short, downward stream about 0.9 game metres from the emitter, making enemies near the feet reachable. Holding fire builds pressure over 1.2 seconds: launch speed and angle increase smoothly until the stream reaches about 8 metres on level ground. Release to return to the short range. The liquid always launches forward from beneath the character's hands and follows a gravity-driven parabola. The glossy surface pulses as it flows, breaks into droplets near the end, and splashes against enemies, walls, and the ground, with expanding rings on the pavement. Its particle capacity covers the full fall from this height; collisions account for obstacle height, allowing liquid to pass above benches and cars.

The ground ring previews the landing point, and the spray range meter shows the pressure and distance. The marker hides and the meter reads BLOCKED if an obstacle cuts the trajectory short. Every tap produces at least a 75 ms burst, including clicks shorter than a frame. Ground splashes also damage enemies within about half a metre of the landing point, plus their collision radius; splash damage respects obstacles and shares the direct-hit cooldown.

Liquid already in flight keeps its own trajectory when the character turns or the pressure changes. Releasing fire lets the remaining liquid fall. Collision and damage follow the actual liquid parcels, so the stream stops at the first enemy or obstacle. Hits deal 2 damage, at most once every 0.1 seconds per enemy, with stronger knockback.

## City and enemies

The game takes place in a small neighbourhood with a cobbled square, pedestrian crossings, tram tracks, cafes, trees, and parked cars. Buildings and street furniture have collision boundaries. Enemies navigate around obstacles using a shared navigation grid. The stream cannot pass through obstacles.
Buildings smoothly fade to 12% opacity when they overlap the character's feet, body, shoulders, or head along the camera's line of sight. Walls, roofs, windows, and signs fade together and return to full opacity once the view is clear.

Waves contain fast, animated slimes and slower, tougher snails. A slime is worth 100 points; a snail is worth 150. Both enemy models are free and openly licensed: Slime by Quaternius (CC0) and Snail by Poly by Google (CC BY 3.0). Sources, licences, and modifications are listed in [CREDITS.md](./CREDITS.md) and the in-game Models & credits page.

## Files

- `index.html` and `style.css`: game interface and controls.
- `bootstrap.js`: startup, timeout handling, and visible loading errors.
- `server.py`: local server with fresh application modules.
- `vendor/`: pinned Three.js modules and local fonts with their licences.
- `game.js`: movement, waves, damage, and input.
- `city.js`: environment, collisions, and navigation.
- `liquid.js`: ballistic liquid simulation, fluid surface, droplets, splashes, and hit detection.
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

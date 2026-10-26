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

Movement defaults to **Direct movement**, using screen directions: up always moves toward the top of the screen, regardless of which way the character faces. Arrow keys, `WASD`, and the joystick immediately move in the chosen screen direction while the character and stream smoothly turn toward it. Movement never waits for the turn to finish, even when reversing direction or spraying. Large turns follow the shortest angle at a capped speed and finish exactly at the requested direction; small aim corrections apply immediately. Direct movement brakes within about 7.5 cm when released at full speed. Diagonal movement is normalized. Choose **Tank controls** for character-relative directions: up moves forward where the character is facing, down moves backward, and left/right turn the character. This applies to both keyboard layouts and the joystick. Releasing the Tank turn input stops rotation immediately. Spraying reduces movement speed and Tank steering speed. Both modes accelerate and brake smoothly, with animation paced to actual travel and a fixed camera viewing angle.

**Aim assist** is enabled by default for Direct mode and can be switched off before starting or in the pause menu. While firing, it gently turns the character and stream toward a living enemy within 25 degrees of the requested direction and about nine metres of the player. Obstacles block target selection. A gold ring marks the selected enemy. A valid lock is retained until the enemy dies, leaves range, becomes blocked, or moves more than 32 degrees away from the requested direction, preventing constant target switching or tracking around behind the player. Obstruction checks are batched at 10 Hz. Aim assist does not steer movement, change pressure, extend range, or bend liquid already in flight. Tap near and hold far as usual. The setting is remembered separately from the movement mode and has no effect in Tank mode.

For precise manual keyboard aiming in Direct mode, hold `Shift` with `Left` / `Right` (or `A` / `D`) to rotate in place at any angle, including while spraying. Shift temporarily overrides aim assist. Releasing the direction keys stops rotation immediately. Shift alone stops travel and holds the current aim. `Shift` + `Up` / `Down` (or `W` / `S`) moves slowly forward/backward along the chosen aim without snapping it to a world direction. Normal directional movement and enabled aim assistance resume when Shift is released. Without aim assist, releasing Shift keeps the chosen angle until another movement command. In Tank mode, Shift slows movement and steering.

Choose a movement card before starting, or open **CONTROLS** during a round. Press `Esc` to pause or resume; the pause menu also contains the movement cards. The round pauses while this dialog is open. Changing modes clears held inputs, and the browser remembers the selection for future visits when storage is available. The cards are native radio groups with keyboard navigation and visible focus. Instructions update to match the selected mode.

Tap the left mouse button or `Space` for nearby enemies, or hold to spray farther. The stream follows the character's actual facing direction from beneath his joined hands. On touchscreens, drag anywhere in the left control area; the joystick response is gentler near the centre for fine positioning and reaches full speed at the edge. The floating joystick appears under your thumb and its base follows long drags. Release to stop. Use a second finger on SPRAY to fire while moving. Touch controls support portrait and landscape layouts and reset when the app loses focus. Hit the approaching enemies to clear waves and earn points.

The character's axes are aligned, and his legs use a skeleton with hip, knee, and ankle joints.
The character reaches the third-floor windows of the map's buildings. His height is three storeys at 1.15 game units each (3.45 total), using the same storey spacing as the facades. The emitter, collision radius, and liquid thickness match this size. The camera frames his full height, and the running animation follows the distance travelled with a stride proportional to his height.

## Loading

The entry point uses one version for all game modules. Hero download progress uses the decoded file size from the GLB header, so HTTP compression cannot push it above 100%. The counter stops at 99% during transfer, then shows “Preparing the models…” until all models and the hero rig are ready. Startup errors appear above the start button with a retry button instead of leaving the game on an indefinite loading screen. The local server disables caching for JavaScript, HTML, and CSS. A plain static server still works; use the included server during development to keep modules fresh.

## Liquid stream

A tap sends a short, downward stream about 0.9 game metres from the emitter, making enemies near the feet reachable. Holding fire builds pressure over 1.2 seconds: launch speed and angle increase smoothly until the stream reaches about 8 metres on level ground. Release to return to the short range. The liquid always launches forward from beneath the character's hands and follows a gravity-driven parabola. The glossy surface pulses as it flows, breaks into droplets near the end, and splashes against enemies, walls, and the ground, with expanding rings on the pavement. Its particle capacity covers the full fall from this height; collisions account for obstacle height, allowing liquid to pass above benches and cars.

The ground ring previews the landing point, and the spray range meter shows the pressure and distance. The marker hides and the meter reads BLOCKED if an obstacle cuts the trajectory short. Every tap produces at least a 75 ms burst, including clicks shorter than a frame. Ground splashes also damage enemies within about half a metre of the landing point, plus their collision radius; splash damage respects obstacles and shares the direct-hit cooldown.

Liquid already in flight keeps its own trajectory when the character turns or the pressure changes. Releasing fire lets the remaining liquid fall. Collision and damage follow the actual liquid parcels, so the stream stops at the first enemy or obstacle. Hits deal 2 damage, at most once every 0.1 seconds per enemy, with stronger knockback.

On devices with a coarse primary pointer, the stream keeps its glossy coating and alpha transparency with refraction disabled, avoiding an extra scene render. Empty stream and droplet meshes stay hidden on all devices, and their GPU buffers upload only when they contain visible geometry. These rendering choices do not change the stream's physics, range, or damage.

## City and enemies

The game takes place in a small neighbourhood with a cobbled square, pedestrian crossings, tram tracks, cafes, trees, and parked cars. Buildings and street furniture have collision boundaries. Enemies navigate around obstacles using a shared navigation grid. The stream cannot pass through obstacles.
Buildings smoothly fade to 12% opacity when they overlap the character's feet, body, shoulders, or head along the camera's line of sight. Walls, roofs, windows, and signs fade together and return to full opacity once the view is clear.

Waves contain fast, animated slimes and slower, tougher snails. A slime is worth 100 points; a snail is worth 150. Both enemy models are free and openly licensed: Slime by Quaternius (CC0) and Snail by Poly by Google (CC BY 3.0). Sources, licences, and modifications are listed in [CREDITS.md](./CREDITS.md) and the in-game Models & credits page.

Successful enemy bites emit a red splash from the animated shin nearest the attacker. Eighteen droplets fly outward, fall, flatten briefly on the pavement, and shrink away. The effect triggers only when health is lost, continues after a fatal bite, and resets when restarting. A shared instanced mesh caps the droplets at 64 and renders them in one draw call.

Five medkits are scattered across the square and the four main streets each round. Look for floating white cases with green crosses and a green ground ring. Walk over one to restore up to two health points. They remain available at full health, are consumed once per round, and return when restarting. Placement leaves clearance for the player; pickups require a clear path. All five kits share three instanced meshes.

## Files

- `index.html` and `style.css`: game interface and controls.
- `bootstrap.js`: startup, timeout handling, and visible loading errors.
- `server.py`: local server with fresh application modules.
- `vendor/`: pinned Three.js modules and local fonts with their licences.
- `game.js`: movement, waves, damage, and input.
- `touch-controls.js`: floating analog joystick and independent multitouch spray control.
- `movement.js`: Direct and Tank movement, shared keyboard layouts, analog speed, and collision handling.
- `aim-assist.js`: Direct-mode target selection, stable locks, bounded aim correction, and batched obstruction checks.
- `city.js`: environment, collisions, and navigation.
- `liquid.js`: ballistic liquid simulation, fluid surface, droplets, splashes, and hit detection.
- `enemies.js`: loading and animating the slime and snail models.
- `hero.js`: character rig, animation, and stream emitter.
- `bites.js`: red droplets marking damaging snail and slime bites.
- `medkits.js`: collectible health kits, street placement, and pickup handling.
- `assets/bad-bad-boy.glb`: character without its stand: 30,000 triangles, 21,052 vertices, preserved UVs and a 1024 × 1024 JPEG colour atlas (1,015,852 bytes total).
- `assets/enemies/`: original enemy GLBs with materials and animations.
- `scripts/prepare-model.mjs`: prepare the game GLB from the source model.
- `scripts/optimize-model.mjs`: simplify geometry with meshoptimizer, reorder the vertex cache, compact vertex streams, use 16-bit indices, and encode the texture with Sharp.

## Prepare the character model

The game model was derived from `bc222867938641be8050f747614e5d34.glb`. The source file incorrectly assigns its 8000 × 8000 colour atlas as a normal map. The preparation script reassigns it to base colour, removes the stand and separate plane, and aligns the model for its skeleton. It then automatically optimizes the result: 305,625 → 30,000 triangles, 183,001 → 21,052 vertices, and a 1024 × 1024 JPEG atlas instead of the intermediate 2048 × 2048 PNG. This reduces the game GLB from 18,326,612 to 1,015,852 bytes (94.5% smaller). UVs and normals are retained; simplification also accounts for hip, knee, and ankle weight transitions. The material, skeleton coordinate frame, and stream origin stay compatible with the game. The output is a standard GLB with no runtime compression decoder required.

To prepare it again, install Node.js and the development dependencies:

```bash
npm ci
npm run prepare-model -- /path/to/bc222867938641be8050f747614e5d34.glb
```

Normal gameplay uses the prepared GLB and does not require installing dependencies.

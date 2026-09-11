# Open Road

A browser driving game: one car, an empty road, and an uninterrupted drive through forest, desert, snow mountains, and night.

Play at [road.neuromancer.in](https://road.neuromancer.in).

## Run

Use Node.js 22.12 or newer.

1. Open a terminal in this folder.
2. Run `nvm use` if you use nvm.
3. Run `npm install` on first use.
4. Run `npm run dev`.
5. Open <http://127.0.0.1:4173>.
6. Press Ctrl+C in the terminal to stop the server.

On this Mac, `./play.command` starts the game and opens the browser. Keep its terminal open while playing. Hot reload is disabled to prevent edits from interrupting a drive or the audio; reload manually after editing.

## Controls

| Control                   | Action                                              |
| ------------------------- | --------------------------------------------------- |
| W / Up                    | Accelerate                                          |
| S / Down                  | Brake, then hold to reverse                         |
| A / D / Left / Right      | Steer the car manually                              |
| Space + steering          | Handbrake drift; countersteer to catch the slide    |
| X                         | Accelerate with turbo; release X for blow-off       |
| P / steering-wheel button | Toggle autopilot; driving input takes over          |
| B / radio panel           | Live radio, station selection and volume            |
| Landscape menu            | Drive into forest, desert, snow mountains, or night |
| R / weather button        | Rain in forest/desert; snowfall in snow mountains   |
| C                         | Cycle chase, low chase, and bonnet cameras          |
| M / sound button          | Toggle audio                                        |
| H                         | Hide or show the HUD                                |
| ?                         | Controls and credits                                |

The first driving input or sound-button click unlocks browser audio. Touch driving controls appear on narrow screens. Losing focus releases held controls. There is no pause control; changing landscape, weather, or camera preserves the drive. Browser background throttling can reduce rendering; elapsed driving time is retained when frames resume.

The car can use 1.6-metre shoulders on either side of the asphalt. Gravel gradually scrubs speed; the outer boundary prevents driving into the wilderness. Hold S through a stop to engage reverse after a short delay. W brakes while reversing, then selects forward drive. Reverse is limited to 25 km/h. Touching the asphalt edge does not clamp the car or abruptly remove speed. Manual driving has no automatic steering; steer through bends and brake for tight corners. Optional autopilot cruises at up to 140 km/h and brakes ahead of bends, with lower corner speeds in rain. Any WASD, arrow, handbrake or turbo input immediately takes over. There are no other vehicles, objectives, or scores. A selected landscape starts ahead of the car and blends across a 96-metre section. Keep driving to reach it.

## Rendering and driving

- Detailed BMW M4 Competition model, with 206,593 source triangles retained, animated wheels, brake lights, dark glass, blue-and-white NFS-inspired paint, and surface-normal water beads/film without floating impact particles.
- Scanned broadleaf trees, ferns, rocks, 2K asphalt, forest-floor, sand and snow materials. Dense mixed forest, rolling sand dunes, and mountain relief based on USGS/Mapzen Cascade Range elevation, exposed cliffs and snow-covered branches. Wind moves foliage and its shadows.
- Five visible road sections plus two prepared ahead. Textures and shader variants initialize before driving; new sections generate in idle work. Rough terrain and foliage use diffuse lighting with their scan normal maps. Terrain buffers allocate typed arrays directly, and instance updates avoid temporary matrix views. Nearby trees use 12,337-triangle meshes; individual trees switch to 1,510-triangle meshes beyond 22 metres. Ferns use simplified scanned geometry. Trees beyond 100 metres use upright views baked from the same models; detailed meshes remain nearby. Distant trees outside the camera view are culled individually. Baked tree views and a separate 79,623-triangle car mesh serve the wet-road reflection, refreshed every frame at low resolution. Shadow casting is limited to nearby scenery. Whole bush/rock footprints and low tree geometry clear the road, including bends.
- C2-continuous road joins, true straights (including a 3.2 km acceleration stretch), broad sweeps and tighter curves. Distances and speed use metres and seconds. Longitudinal forces include tapered tractive force, power limits, gearing, aerodynamic drag, rolling resistance and engine braking; physics uses 120 Hz substeps. Hold X to accelerate and spool up to 0.9 bar of boost. Maximum speed is 320 km/h. The isolated powertrain reaches 100 km/h in about 9.5 seconds without boost and 320 km/h in about 41 seconds with continuous boost; curves and road-edge contact reduce real driving speed.
- The chase camera stays directly behind the chassis, including during a drift. Keyboard steering builds progressively and recentres promptly. Wheel-angle limits include tyre understeer compensation, retaining steering authority at highway speeds. A single-track tyre model calculates front/rear slip and yaw; the handbrake reduces rear grip. Countersteering and grip recovery catch the slide. Tyre smoke and skid marks follow the wheel paths.
- Clouds build before precipitation. Road wetness accumulates and dries gradually. Rain includes reflections, streaks, splashes and tyre spray; snowy terrain uses slow, drifting flakes.
- Separate V8 power and overrun recordings crossfade with throttle and remain audible while coasting. Pitch follows RPM with subtle firing variation; a rising turbo whistle, air hiss and pressure-release sound accompany boost. Soft exhaust plumes and pops appear briefly on boosted shifts and throttle lift, with no rigid cones or rhythmic flame jets. Recorded skid, rain and forest loops plus road/wind/brake layers continue through transitions.
- Car reflections use a prefiltered HDR environment with continuous weather blending. Moving, staggered cube-face captures are removed. Wet paint has filtered roughness and subdued micro droplets; foliage uses alpha-to-coverage to reduce edge shimmer.
- Live radio offers Simulator Radio, SR Rock and SR Dance with independent volume. Streams connect only when enabled and play alongside engine/weather audio. Internet access is required; stream failure is reported in the radio panel. M mutes both driving audio and radio. Provider: [Simulator Radio](https://simulatorradio.com/about); broadcasts stream directly from the provider and are not bundled with the game.
- Night drive has a moon, stars, dark forest, headlight beams, illuminated roadside markers and brighter rear lights that cast red light onto the rear bodywork. Choose it in the landscape menu; the change occurs ahead while driving.

This remains a realtime browser prototype rather than photographic footage or a validated vehicle simulator. Terrain, suspension motion, drift and water effects are approximations. The tyre model is simplified and the terrain is rescaled to the road; there is no full suspension/contact solver, water accumulation simulation or ray-traced global illumination. The V8 recordings are not calibrated to this specific BMW. Performance depends on hardware and viewport.

## Verification

- `npm test`: 31 checks covering driving and drift boundaries, camera placement, braking, wet grip, frame-rate consistency, weather timing, route continuity, model material identities, and scenery clearance.
- `npm run build`: production output in `dist/`.
- `npm run preview`: serve that output at <http://127.0.0.1:4173>.

Browser QA on this Mac covered all four landscapes, map transitions, precipitation, braking, drift and sustained audio. The original skid sample produced invalid samples after looping in this browser; the clean 48 kHz PCM loop keeps the audio graph finite beyond 100 seconds. Per-channel diagnostics remain available through the optional `get_drive_state` WebMCP tool. The latest controlled full-rain run reached 318 km/h with live radio and no boundary contact; sampled frame rates ranged from 30 to 56 fps in the 723×998 in-app panel, with occasional early hitches up to 166 ms. This is not a locked-60-fps result. GPU timing is opt-in with `?profile`; regular FPS counts actual frames per second.

Assets total approximately 74 MB and are served with the game. Google Fonts is optional; system fonts provide a fallback. See [ASSETS.md](ASSETS.md) for credits and preparation details.

Production QA on 2026-09-12 at 1280×720: moving samples ranged from 29 to 38 fps across dry forest, full rain, night with radio, desert, and snowfall. All 73 deployed files returned HTTP 200; no browser errors were observed. The 48-second demo averaged 31 game frames per second while recording, with a brief minimum of 14 fps; the encoded MP4 contains about 27 frames per second. Section preparation still produced an 85 ms CPU spike. These are observations from one browser and machine, not a performance guarantee.

Direct starting views are available with `?map=forest`, `?map=desert`, `?map=snow`, or `?map=night`. These only set the initial scene; menu changes during play still transition on the road.

## Record a drive

1. Open the game with `?demo` in a browser that supports canvas recording.
2. Keep the tab in the foreground. Use a landscape window for a wide video.
3. Click **Record drive**. The car drives automatically through daylight, rain, and night.
4. Wait for **Video ready**. Simulator Radio starts after the night transition.
5. Click **Download video**. The clip contains the game canvas, engine, weather, and radio audio.

The sequence takes about 50 seconds. Recording happens on your device. Video files are not uploaded or committed to this repository. Radio availability and recording support depend on your browser and connection.

## Deploy

Vercel uses Node.js 22, runs `npm run build`, and serves `dist/`. Link this folder to your Vercel project with `vercel link`, then run `vercel --prod`. Set the production branch to `main` when connecting GitHub.

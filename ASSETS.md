# Asset sources

Assets retrieved and attribution checked on 2026-09-11. Runtime files are bundled locally.

| Asset                                             | Source                                                                                                                                                                                                            | License / attribution                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BMW M4 Competition M Package                      | [Original model](https://sketchfab.com/3d-models/bmw-m4-competition-m-package-5c0a2dafb1ad408d9fc9eeef9aee531b); [source file mirror](https://github.com/lukaizj/car-mod-saas/blob/main/public/models/bmw-m4.glb) | SRT Performance ([artist](https://sketchfab.com/TheRealSRT)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Author, source and license are embedded in the GLB.   |
| Scanned broadleaf tree, fern and boulder          | Poly Haven: [Tree Small 02](https://polyhaven.com/a/tree_small_02), [Fern 02](https://polyhaven.com/a/fern_02), [Boulder 01](https://polyhaven.com/a/boulder_01)                                                  | CC0                                                                                                                                                                            |
| Asphalt and forest ground                         | Poly Haven: [Asphalt 02](https://polyhaven.com/a/asphalt_02), [Forest Ground 04](https://polyhaven.com/a/forest_ground_04), [Forest Floor](https://polyhaven.com/a/forest_floor)                                  | CC0                                                                                                                                                                            |
| Desert, snow and cliff surfaces                   | Poly Haven: [Sand 01](https://polyhaven.com/a/sand_01), [Snow 02](https://polyhaven.com/a/snow_02), [Rock Face 03](https://polyhaven.com/a/rock_face_03)                                                          | CC0                                                                                                                                                                            |
| HDR skies                                         | Poly Haven: [Kloofendal 48d](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), [Kloofendal Overcast](https://polyhaven.com/a/kloofendal_overcast_puresky)                                            | CC0                                                                                                                                                                            |
| Procedural pine trees, foliage textures and grass | [EZ-Tree 1.1.0](https://github.com/dgreenheck/ez-tree), Daniel Greenheck                                                                                                                                          | MIT distribution; notice in `public/licenses/ez-tree-MIT.txt`. Bark source notices remain in the dependency's `src/lib/assets/bark/README.md`.                                 |
| V8 power and overrun loops                        | [Generic V8 Engine Sound](https://opengameart.org/content/generic-v8-engine-sound)                                                                                                                                | Sound made by DerMeehdrescher / Meehdrescher Studios. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Re-encoded PCM WAV derivatives retain this license.     |
| Mountain elevation grid                           | [Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), `N46W122.hgt.gz`                                                                                                                     | United States 3DEP, GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey; public domain. Cropped to eastern Cascade ridges, resampled and vertically scaled. |
| Forest ambience                                   | [Forest Ambience](https://opengameart.org/content/forest-ambience), TinyWorlds                                                                                                                                    | CC0                                                                                                                                                                            |
| Rain loop                                         | [Rain (loopable)](https://opengameart.org/content/rain-loopable), Ylmir                                                                                                                                           | CC0                                                                                                                                                                            |
| Tyre skid loop                                    | [Car Tire Skid Squealing](https://opengameart.org/content/car-tire-skid-squealing), Mike Koenig (Soundbible), edited by qubodup                                                                                   | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); trimmed and re-encoded locally.                                                                                     |
| Three.js and Draco decoder                        | [Three.js](https://github.com/mrdoob/three.js), [Draco](https://github.com/google/draco)                                                                                                                          | MIT / Apache 2.0; notices in `public/licenses/`.                                                                                                                               |
| DM Sans / Manrope                                 | [Google Fonts](https://fonts.google.com/)                                                                                                                                                                         | SIL Open Font License; requested through Google Fonts CSS.                                                                                                                     |

Local modifications: NFS-inspired blue-and-white car paint/glass materials, wheel rig, brake lights, surface water film, reflection probes, procedural exhaust flames; tree LOD meshes, model normalization, snow cover and wind; terrain, road, weather and UI; audio gain/pitch/filter processing. No affiliation with the vehicle manufacturer or asset authors is implied. No Forza game assets are included. The earlier Ferrari placeholder and city assets are excluded from the runtime.

## Asset preparation

`python3 scripts/fetch-assets.py` restores source textures, HDRs, fern files, and raw scanned models. It does not replace bundled optimized meshes. Raw models are kept in the ignored `.source-assets/` directory. Exact direct URLs are recorded in `public/assets/sources.json` and `scripts/model-sources.json`.

The car uses Draco and WebP compression without geometry simplification. Preserve material identities: palette conversion merges body paint, glass and trim and prevents the material/animation setup from identifying them.

```sh
npx --yes @gltf-transform/cli@4.5.0 optimize .source-assets/bmw-m4.glb public/assets/car.glb --simplify false --palette false --join false --flatten false --instance false --compress draco --texture-size 2048 --texture-compress webp
```

The runtime tree meshes have 12,337 triangles nearby and 1,510 in the distance, retaining the scanned textures. The fern mesh is simplified to 18% of the source geometry; the boulder has a simplified 6,494-triangle mesh. The fern uses one variant from the original four-variant scene. Grass and Draco decoder files are copied from the installed dependencies.

Runtime foliage derivatives:

```sh
npx --yes @gltf-transform/cli@4.5.0 optimize public/assets/tree.glb public/assets/tree-near.glb --simplify true --simplify-ratio .24 --simplify-error .025 --palette false --join false --flatten false --instance false --compress draco --texture-compress false
npx --yes @gltf-transform/cli@4.5.0 optimize public/assets/tree-lod.glb public/assets/tree-far.glb --simplify true --simplify-ratio .3 --simplify-error .05 --palette false --join false --flatten false --instance false --compress draco --texture-compress false
npx --yes @gltf-transform/cli@4.5.0 optimize public/assets/fern_02/fern_02.gltf public/assets/fern.glb --simplify true --simplify-ratio .18 --simplify-error .015 --palette false --join false --flatten false --instance false --compress draco --texture-compress false
```

Turbo whistle, air hiss, blow-off and exhaust pops are synthesized locally.

The skid loop is one second of clean 48 kHz stereo PCM16. Preserve this encoding when changing it; the original 44.1 kHz loop produced NaNs in the browser audio graph after wrapping.

```sh
ffmpeg -i .source-assets/skid-original.wav -ar 48000 -ac 2 -t 1 -map_metadata -1 -c:a pcm_s16le public/audio/skid-clean.wav
```

Mountain data source: `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N46/N46W122.hgt.gz`. Run `python3 scripts/prepare-terrain.py` after fetching the raw grid. The 256×256 little-endian UInt16 crop spans 46.69–46.91 N, 121.39–121.69 W and excludes Mount Rainier's volcanic cone. This is adapted scenery, not a geographic recreation.

V8 archive: `https://opengameart.org/sites/default/files/genericv8sound.zip`. `Acc_05570.wav` and `Dec_05581.wav` supply power and overrun loops near 5,570 RPM. Runtime derivatives `v8-power.wav` and `v8-overrun.wav` are 48 kHz stereo PCM16, with metadata removed. The modifications are licensed CC BY-SA 4.0.

Livery visual reference: [BMW's Most Wanted M3 GTR](https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m3-gtr-need-for-speed-most-wanted.html). The livery is implemented locally in a shader on the M4 model; no game artwork or extracted game assets are included. Moon and stars are generated locally.

The detailed car remains unchanged. `car-reflection.glb` is a 79,623-triangle derivative used only in wet-road reflections. Its geometry is simplified; source materials and attribution are preserved.

```sh
npx --yes @gltf-transform/cli@4.5.0 optimize public/assets/car.glb public/assets/car-reflection.glb --simplify true --simplify-ratio .16 --simplify-error .01 --palette false --join false --flatten false --instance false --compress draco --texture-compress false
```

Far tree cards are baked locally at startup from the bundled tree geometry and textures. They are generated assets under the same CC0/MIT source terms. Car/environment radiance blends the two prefiltered HDR skies; no moving cube-face capture is used.

Radio stream endpoints were verified against the official [Simulator Radio player](https://simulatorradio.com/) on 2026-09-12: `https://simulatorradio.stream/stream`, `/rock`, and `/dance`. The broadcaster supplies the live audio directly to the user's personal player; no broadcast recordings or music files are included in this project. Station names link back to the provider.

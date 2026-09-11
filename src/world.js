import * as THREE from "three";
import { Tree } from "@dgreenheck/ez-tree";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { roadCenter, ROAD_HALF_WIDTH, DRIVE_HALF_WIDTH } from "./driving.js";
import { safeSceneryOffset, sceneryFootprint } from "./placement.js";
import { sampleElevation } from "./elevation.js";
import { bakeTreeImpostor } from "./tree-impostor.js";
let mountainHeights;
import { Route, SECTION_LENGTH as LENGTH } from "./route.js";
const TILE_COUNT = 5;
const dummy = new THREE.Object3D();
const smooth = (x) => x * x * (3 - 2 * x);
function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function terrain(type, x, s) {
  const d = Math.max(0, Math.abs(x) - DRIVE_HALF_WIDTH - 0.2),
    edge = Math.min(1, d / 9);
  const n = Math.sin(s * 0.036 + x * 0.049) * Math.sin(s * 0.013 - x * 0.047);
  if (type === "desert") {
    const windRidge =
      0.5 + 0.5 * Math.sin(x * 0.029 + s * 0.008 + Math.sin(s * 0.019) * 0.45);
    const ripple = Math.sin(x * 0.115 - s * 0.034) * 0.22;
    return (
      -0.06 +
      edge * (0.35 + windRidge * windRidge * 5 + ripple) +
      Math.max(0, d - 35) * 0.065
    );
  }
  if (type === "snow") {
    const elevation = sampleElevation(
      mountainHeights,
      256,
      0.12 + Math.abs(x) / 650,
      s / 1800,
    );
    const foothill = 0.8 + Math.sin(s * 0.045 + x * 0.07) * 0.45;
    const rise = 1 - Math.exp(-Math.max(0, d - 18) / 75);
    return -0.06 + edge * foothill + rise * Math.max(0, elevation - 650) * 0.09;
  }
  return (
    -0.07 + edge * (0.55 + n * 0.7) + Math.max(0, d - 18) * 0.11 * (1 + n * 0.8)
  );
}
function makeStrip(start, min, max, height, route, across = 1) {
  const count = 49 * (across + 1);
  const positions = new Float32Array(count * 3),
    uvs = new Float32Array(count * 2),
    colors = new Float32Array(count * 3),
    indices = new Uint16Array(48 * across * 6);
  let index = 0;
  for (let i = 0; i <= 48; i++) {
    const s = start + (i / 48) * LENGTH,
      blend = route.blend(s),
      f = smooth(blend.mix);
    for (let j = 0; j <= across; j++) {
      const t = j / across;
      const x = THREE.MathUtils.lerp(
        min,
        max,
        min < 0 ? 1 - (1 - t) ** 2 : t ** 2,
      );
      const y =
        height ??
        THREE.MathUtils.lerp(
          terrain(blend.from, x, s),
          terrain(blend.to, x, s),
          f,
        );
      const vertex = i * (across + 1) + j;
      positions[vertex * 3] = roadCenter(s) + x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = -s;
      uvs[vertex * 2] = x / 3;
      uvs[vertex * 2 + 1] = s / 3;
      const tint =
        height === null ? 0.78 + 0.22 * Math.sin(x * 0.29 + s * 0.13) ** 2 : 1;
      colors.fill(tint, vertex * 3, vertex * 3 + 3);
      if (i < 48 && j < across) {
        const a = i * (across + 1) + j,
          b = a + across + 1;
        indices[index++] = a;
        indices[index++] = a + 1;
        indices[index++] = b;
        indices[index++] = b;
        indices[index++] = a + 1;
        indices[index++] = b + 1;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}
function modelParts(root, targetHeight = null) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root),
    size = box.getSize(new THREE.Vector3()),
    centre = box.getCenter(new THREE.Vector3());
  const scale = targetHeight ? targetHeight / size.y : 1,
    parts = [];
  root.traverse((o) => {
    if (o.isMesh) {
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geometry.translate(-centre.x, -box.min.y, -centre.z);
      geometry.scale(scale, scale, scale);
      const material = o.material.clone();
      material.side = THREE.DoubleSide;
      parts.push({ geometry, material });
    }
  });
  return parts;
}
export async function createWorld(
  scene,
  renderer,
  manager,
  initialLandscape = "forest",
) {
  mountainHeights = new Uint16Array(
    await new THREE.FileLoader(manager)
      .setResponseType("arraybuffer")
      .loadAsync("/assets/mountain-height.bin"),
  );
  const route = new Route(initialLandscape),
    loader = new THREE.TextureLoader(manager),
    gltf = new GLTFLoader(manager).setDRACOLoader(
      new DRACOLoader(manager).setDecoderPath("/draco/"),
    );
  async function texture(name, color = false) {
    const t = await loader.loadAsync("/assets/" + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const names = [
    "asphalt_02",
    "forest_ground_04",
    "forest_floor",
    "sand_01",
    "snow_02",
    "rock_face_03",
  ];
  const textures = {};
  await Promise.all(
    names.map(async (name) => {
      const [map, normalMap] = await Promise.all([
        texture(name + "_Diffuse.jpg", true),
        texture(name + "_nor_gl.jpg"),
      ]);
      textures[name] = { map, normalMap };
    }),
  );
  const roughness = await texture("asphalt_02_Rough.jpg");
  const roadMaterial = new THREE.MeshStandardMaterial({
    ...textures.asphalt_02,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: roughness,
    roughness: 1,
    color: 0x999999,
  });
  const groundMaterials = {};
  for (const [type, tex, color] of [
    ["forest", "forest_floor", 0x969c7b],
    ["night", "forest_floor", 0x969c7b],
    ["desert", "sand_01", 0xe1be82],
    ["snow", "snow_02", 0xffffff],
  ])
    groundMaterials[type] = new THREE.MeshLambertMaterial({
      ...textures[tex],
      color,
      vertexColors: true,
      normalScale: new THREE.Vector2(0.8, 0.8),
    });
  const shoulder = new THREE.MeshStandardMaterial({
    ...textures.forest_ground_04,
    color: 0x7e8175,
    roughness: 1,
  });
  const white = new THREE.MeshStandardMaterial({
      color: 0xe3e2d0,
      roughness: 0.82,
    }),
    yellow = new THREE.MeshStandardMaterial({
      color: 0xd9b953,
      roughness: 0.8,
    });
  const [treeAsset, fernAsset, rockAsset, grassAsset, treeLowAsset] =
    await Promise.all([
      gltf.loadAsync("/assets/tree-near.glb"),
      gltf.loadAsync("/assets/fern.glb"),
      gltf.loadAsync("/assets/boulder.glb"),
      gltf.loadAsync("/assets/grass.glb"),
      gltf.loadAsync("/assets/tree-far.glb"),
    ]);
  const broadleafLow = modelParts(treeLowAsset.scene, 1);
  const broadleaf = modelParts(treeAsset.scene, 1),
    fern = modelParts(fernAsset.scene.children[0], 1),
    rock = modelParts(rockAsset.scene, 1),
    grass = modelParts(grassAsset.scene, 1);
  grass.forEach((p) => {
    p.material.color.set(0x9fae80);
    p.material.alphaTest = 0.65;
  });
  fern.forEach((p) => {
    p.material.color.set(0xb6c8a1);
    p.material.alphaTest = 0.45;
  });
  const pineTree = new Tree();
  pineTree.loadPreset("Pine Medium");
  pineTree.options.leaves.count = 14;
  pineTree.options.leaves.size = 2.7;
  pineTree.options.branch.children[0] = 40;
  pineTree.options.branch.sections[1] = 5;
  pineTree.options.branch.segments[1] = 4;
  pineTree.generate();
  const pine = modelParts(pineTree, 1);
  const farPineTree = new Tree();
  farPineTree.loadPreset("Pine Medium");
  farPineTree.options.leaves.count = 7;
  farPineTree.options.leaves.size = 3.6;
  farPineTree.options.branch.children[0] = 22;
  farPineTree.options.branch.segments[1] = 3;
  farPineTree.options.branch.sections[1] = 3;
  farPineTree.generate();
  const pineLow = modelParts(farPineTree, 1);
  // Rough foliage keeps scan normals and consistent lighting across detail levels.
  for (const part of [
    ...broadleaf,
    ...broadleafLow,
    ...pine,
    ...pineLow,
    ...fern,
    ...grass,
  ]) {
    const old = part.material;
    part.material = new THREE.MeshLambertMaterial({
      name: old.name,
      color: old.color,
      map: old.map,
      normalMap: old.normalMap,
      normalScale: old.normalScale,
      aoMap: old.aoMap,
      alphaMap: old.alphaMap,
      alphaTest: old.alphaTest,
      side: old.side,
      vertexColors: old.vertexColors,
    });
  }
  const wind = { value: 0 };
  const distantLight = { value: 0.72 };
  const broadleafImpostor = bakeTreeImpostor(
    broadleaf,
    renderer,
    distantLight,
    wind,
  );
  const pineImpostor = bakeTreeImpostor(pine, renderer, distantLight, wind);
  for (const part of [
    ...pine,
    ...pineLow,
    ...broadleaf,
    ...broadleafLow,
    ...fern,
    ...grass,
  ]) {
    part.material.alphaToCoverage = part.material.alphaTest > 0;
    part.material.userData.wind = true;
    part.material.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = wind;
      shader.vertexShader = "uniform float windTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n vec3 windPoint=(instanceMatrix*vec4(position,1.)).xyz;float gust=.55+.45*sin(windTime*.37+windPoint.z*.018);float sway=sin(windTime*.8+windPoint.x*.031+windPoint.z*.013)*gust;transformed.x+=sway*.018*position.y*position.y;transformed.z+=sway*.008*position.y*position.y;transformed.x+=sin(windTime*2.8+position.x*47.)*.002*position.y;`,
      );
    };
  }
  const snowyPine = pineLow.map((p) => ({
    geometry: p.geometry,
    material: p.material.clone(),
  }));
  snowyPine.forEach((p, i) => {
    const windShader = pineLow[i].material.onBeforeCompile;
    const cover = p.material.name === "leaves" ? 0.22 : 0.025;
    p.material.color.set(0xffffff);
    p.material.roughness = 1;
    p.material.onBeforeCompile = (shader) => {
      windShader(shader);
      shader.vertexShader = "varying float snowCover;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n snowCover=smoothstep(.25,.82,normal.y);",
      );
      shader.fragmentShader =
        "varying float snowCover;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.9,.94,.97),${cover}+snowCover*.78);`,
      );
    };
    p.material.customProgramCacheKey = () => `snow-${cover}`;
    p.depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: p.material.map,
      alphaTest: p.material.alphaTest,
      side: THREE.DoubleSide,
    });
    p.depth.onBeforeCompile = windShader;
  });
  const rockRadius = sceneryFootprint(rock);
  const footprints = {
    rock: rockRadius,
    sandrock: rockRadius,
    snowrock: rockRadius,
    grass: sceneryFootprint(grass),
    fern: sceneryFootprint(fern),
  };
  const treeParts = { broadleaf, pine, snow: pineLow },
    treeFootprints = {};
  function treeRadius(name, height) {
    const key = name + Math.floor(height);
    return (
      Math.SQRT2 *
      height *
      (treeFootprints[key] ??= sceneryFootprint(
        treeParts[name],
        3.5 / Math.floor(height),
      ))
    );
  }
  const sandstone = rock.map((p) => ({
    geometry: p.geometry,
    material: new THREE.MeshStandardMaterial({
      ...textures.rock_face_03,
      color: 0xc4a179,
      roughness: 1,
    }),
  }));
  const snowRock = rock.map((p) => ({
    geometry: p.geometry,
    material: new THREE.MeshStandardMaterial({
      ...textures.rock_face_03,
      color: 0xc3c7c9,
      roughness: 0.95,
    }),
  }));
  snowRock.forEach((p) => {
    p.material.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying float snowCap;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n snowCap=smoothstep(.08,.65,normal.y);",
      );
      shader.fragmentShader =
        "varying float snowCap;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.91,.95),snowCap*.95);",
      );
    };
  });
  const postParts = [
      { geometry: new THREE.BoxGeometry(0.1, 0.85, 0.12), material: white },
    ],
    capParts = [
      {
        geometry: new THREE.BoxGeometry(0.11, 0.12, 0.13),
        material: new THREE.MeshStandardMaterial({
          color: 0xdd9860,
          emissive: 0x995522,
          emissiveIntensity: 0.4,
        }),
      },
    ];
  const group = new THREE.Group();
  scene.add(group);
  const tiles = new Map(),
    pending = new Map();
  const steadyMaterials = new Map();
  const viewFrustum = new THREE.Frustum(),
    viewMatrix = new THREE.Matrix4();
  const treeSphere = new THREE.Sphere();
  const instanceTransform = new THREE.Matrix4();
  let hasView = false;
  let preparing = false;
  let currentProgress = 0;
  function groundHeight(offset, s) {
    const b = route.blend(s);
    return THREE.MathUtils.lerp(
      terrain(b.from, offset, s),
      terrain(b.to, offset, s),
      smooth(b.mix),
    );
  }
  function addInstances(parent, parts, placements, cast = true) {
    if (!placements.length) return;
    for (const part of parts) {
      if (part.material.userData.wind && !part.depth) {
        part.depth = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          map: part.material.map,
          alphaTest: part.material.alphaTest,
          side: THREE.DoubleSide,
        });
        part.depth.onBeforeCompile = part.material.onBeforeCompile;
      }
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        placements.length,
      );
      mesh.castShadow = cast;
      mesh.userData.shadowAllowed = cast;
      mesh.receiveShadow = true;
      if (part.depth) mesh.customDepthMaterial = part.depth;
      placements.forEach((p, i) => {
        dummy.position.set(...p.position);
        dummy.rotation.set(0, p.rotation ?? 0, 0);
        const scale = p.scale ?? 1;
        if (Array.isArray(scale)) dummy.scale.set(...scale);
        else dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (p.color) mesh.setColorAt(i, new THREE.Color(p.color));
      });
      mesh.computeBoundingSphere();
      mesh.userData.sourceMatrices = mesh.instanceMatrix.array.slice();
      mesh.userData.sourceColors = mesh.instanceColor?.array.slice();
      mesh.userData.maxDistance =
        parts === grass ? 110 : parts === fern ? 140 : Infinity;
      parent.add(mesh);
    }
  }
  function blendGroundMaterial(start, blend) {
    const b = blend ?? route.blend(start + LENGTH * 0.5);
    if (b.from === b.to && steadyMaterials.has(b.from))
      return steadyMaterials.get(b.from);
    const material = groundMaterials[b.from].clone();
    if (b.from !== b.to) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.nextGround = { value: groundMaterials[b.to].map };
        shader.uniforms.nextTint = { value: groundMaterials[b.to].color };
        shader.uniforms.firstTint = { value: groundMaterials[b.from].color };
        shader.uniforms.transitionStart = { value: start };
        shader.vertexShader = "varying float roadS;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n roadS=-position.z;",
        );
        shader.fragmentShader =
          "uniform sampler2D nextGround;uniform vec3 nextTint;uniform vec3 firstTint;uniform float transitionStart;varying float roadS;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `float biomeMix=smoothstep(transitionStart,transitionStart+96.,roadS);vec4 oldGround=texture2D(map,vMapUv);vec4 newGround=texture2D(nextGround,vMapUv);diffuseColor*=mix(oldGround, newGround*vec4(nextTint/max(firstTint,vec3(.01)),1.),biomeMix);`,
        );
      };
      material.customProgramCacheKey = () => b.from + "-" + b.to;
    }
    if (b.from === "snow" && b.to === "snow") {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.cliffMap = { value: textures.rock_face_03.map };
        shader.vertexShader =
          "varying float groundSlope;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n groundSlope=normal.y;",
        );
        shader.fragmentShader =
          "uniform sampler2D cliffMap;varying float groundSlope;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(cliffMap,vMapUv*.24).rgb*vec3(.58,.65,.7),1.-smoothstep(.54,.76,groundSlope));",
        );
      };
    }
    if (b.from === b.to) steadyMaterials.set(b.from, material);
    return material;
  }
  function* buildTile(index) {
    const start = index * LENGTH,
      tile = new THREE.Group(),
      rng = random(index * 7131 + 521),
      owned = [];
    const addStrip = (a, b, y, mat, across = 1) => {
      const geometry = makeStrip(start, a, b, y, route, across),
        mesh = new THREE.Mesh(geometry, mat);
      mesh.receiveShadow = true;
      mesh.layers.enable(1);
      tile.add(mesh);
      owned.push(geometry);
    };
    addStrip(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0.03, roadMaterial, 3);
    const groundMat = blendGroundMaterial(start);
    if (![...steadyMaterials.values()].includes(groundMat))
      owned.push(groundMat);
    addStrip(-200, -DRIVE_HALF_WIDTH - 0.2, null, groundMat, 52);
    addStrip(DRIVE_HALF_WIDTH + 0.2, 200, null, groundMat, 52);
    addStrip(-DRIVE_HALF_WIDTH - 0.2, -3.8, -0.005, shoulder);
    addStrip(3.8, DRIVE_HALF_WIDTH + 0.2, -0.005, shoulder);
    addStrip(-3.62, -3.48, 0.037, white);
    addStrip(3.48, 3.62, 0.037, white);
    addStrip(-0.16, -0.055, 0.038, yellow);
    addStrip(0.055, 0.16, 0.038, yellow);
    yield;
    const positions = {
      broadleaf: [],
      pine: [],
      snow: [],
      fern: [],
      grass: [],
      rock: [],
      sandrock: [],
      snowrock: [],
      posts: [],
      caps: [],
    };
    function place(
      name,
      s,
      offset,
      scale,
      rotation = rng() * Math.PI * 2,
      y = null,
    ) {
      if (treeParts[name])
        offset = safeSceneryOffset(offset, treeRadius(name, scale));
      if (footprints[name]) {
        const sx = Array.isArray(scale) ? scale[0] : scale,
          sz = Array.isArray(scale) ? scale[2] : scale;
        const radius = Math.hypot(sx, sz) * footprints[name];
        offset = safeSceneryOffset(offset, radius);
      }
      positions[name].push({
        position: [
          roadCenter(s) + offset,
          y ??
            groundHeight(offset, s) -
              (name.endsWith("rock")
                ? (Array.isArray(scale) ? scale[1] : scale) * 0.18
                : 0),
          -s,
        ],
        rotation,
        scale,
      });
    }
    function biome(s) {
      const b = route.blend(s);
      return rng() < smooth(b.mix) ? b.to : b.from;
    }
    for (let i = 0; i < 145; i++) {
      const s = start + rng() * LENGTH,
        side = rng() < 0.5 ? -1 : 1,
        type = biome(s),
        offset = side * (6.5 + rng() ** 1.7 * 65);
      if (type === "forest" || type === "night") {
        const which = i % 2 === 0 ? "pine" : "broadleaf";
        place(
          which,
          s,
          offset,
          which === "pine" ? 14 + rng() * 11 : 9 + rng() * 9,
        );
      }
      if (type === "snow") place("snow", s, offset, 12 + rng() * 13);
    }
    for (let i = 0; i < 4300; i++) {
      const s = start + rng() * LENGTH,
        type = biome(s),
        side = rng() < 0.5 ? -1 : 1,
        offset = side * (4.45 + rng() ** 2 * 21);
      const patch =
        0.5 +
        0.5 *
          Math.sin(s * 0.22 + offset * 0.5) *
          Math.sin(s * 0.06 - offset * 0.7);
      if ((type === "forest" || type === "night") && rng() < patch) {
        place("grass", s, offset, 0.23 + rng() * 0.4);
        if (i % 55 === 0) place("fern", s, offset, 0.45 + rng() * 0.75);
      }
      if (type === "desert" && i % 170 === 0)
        place("grass", s, offset, 0.15 + rng() * 0.2);
    }
    for (let i = 0; i < 8; i++) {
      const s = start + rng() * LENGTH,
        type = biome(s),
        side = rng() < 0.5 ? -1 : 1,
        offset = side * (5.3 + rng() * 65);
      if (type === "forest" || type === "night")
        place("rock", s, offset, [1 + rng() * 2, 0.4 + rng(), 1 + rng() * 2]);
      if (type === "desert")
        place("sandrock", s, offset, [
          4 + rng() * 12,
          2 + rng() * 10,
          4 + rng() * 12,
        ]);
      if (type === "snow")
        place("snowrock", s, offset, [
          2 + rng() * 7,
          1 + rng() * 4,
          3 + rng() * 6,
        ]);
    }
    for (let i = 0; i < 6; i++)
      for (const side of [-1, 1]) {
        const s = start + i * 16 + 8;
        place("posts", s, side * (DRIVE_HALF_WIDTH + 0.55), 1, 0, 0.43);
        place("caps", s, side * (DRIVE_HALF_WIDTH + 0.55), 1, 0, 0.7);
      }
    yield;
    const highTrees = new THREE.Group(),
      lowTrees = new THREE.Group(),
      farTrees = new THREE.Group();
    tile.add(highTrees, lowTrees, farTrees);
    addInstances(highTrees, broadleaf, positions.broadleaf);
    addInstances(lowTrees, broadleafLow, positions.broadleaf, false);
    addInstances(farTrees, broadleafImpostor, positions.broadleaf, false);
    tile.userData.highTrees = highTrees;
    tile.userData.lowTrees = lowTrees;
    tile.userData.farTrees = farTrees;
    const highPines = new THREE.Group(),
      lowPines = new THREE.Group(),
      farPines = new THREE.Group();
    tile.add(highPines, lowPines, farPines);
    addInstances(highPines, pine, positions.pine);
    addInstances(lowPines, pineLow, positions.pine, false);
    addInstances(farPines, pineImpostor, positions.pine, false);
    tile.userData.highPines = highPines;
    tile.userData.lowPines = lowPines;
    tile.userData.farPines = farPines;
    const reflectionTrees = new THREE.Group();
    addInstances(
      reflectionTrees,
      broadleafImpostor,
      positions.broadleaf,
      false,
    );
    addInstances(reflectionTrees, pineImpostor, positions.pine, false);
    reflectionTrees.traverse((o) => o.layers.set(1));
    tile.add(reflectionTrees);
    tile.userData.treePositions = positions;
    addInstances(tile, snowyPine, positions.snow);
    addInstances(tile, fern, positions.fern, false);
    addInstances(tile, grass, positions.grass, false);
    addInstances(tile, rock, positions.rock);
    addInstances(tile, sandstone, positions.sandrock);
    addInstances(tile, snowRock, positions.snowrock);
    addInstances(tile, postParts, positions.posts);
    addInstances(tile, capParts, positions.caps, false);
    tile.userData.owned = owned;
    tile.userData.start = start;
    if (tiles.has(index)) removeTile(index);
    group.add(tile);
    tiles.set(index, tile);
  }
  function removeTile(index) {
    const tile = tiles.get(index);
    group.remove(tile);
    tile.userData.owned.forEach((o) => o.dispose());
    tile.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    tiles.delete(index);
  }
  function updateLod(high, low, far, placements, progress) {
    const near = placements.map((p) => {
      const distance = Math.hypot(
        p.position[0] - roadCenter(progress),
        -p.position[2] - progress,
      );
      // Keep nearby shadow casters; conservatively bound the whole distant crown.
      if (hasView && distance > 40) {
        treeSphere.center.set(
          p.position[0],
          p.position[1] + p.scale * 0.5,
          p.position[2] + progress,
        );
        treeSphere.radius = p.scale * 0.85 + 8;
        if (!viewFrustum.intersectsSphere(treeSphere)) return null;
      }
      return distance < 22 ? 0 : distance < 100 ? 1 : 2;
    });
    for (const [parent, wanted] of [
      [high, 0],
      [low, 1],
      [far, 2],
    ])
      for (const mesh of parent.children) {
        let count = 0;
        const source = mesh.userData.sourceMatrices,
          target = mesh.instanceMatrix.array;
        for (let i = 0; i < near.length; i++)
          if (near[i] === wanted) {
            for (let j = 0; j < 16; j++)
              target[count * 16 + j] = source[i * 16 + j];
            count++;
          }
        mesh.count = count;
        mesh.visible = count > 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
  }
  function cullGroundInstances(tile, progress) {
    if (!hasView) return;
    for (const mesh of tile.children) {
      if (!mesh.isInstancedMesh) continue;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const source = mesh.userData.sourceMatrices,
        colors = mesh.userData.sourceColors;
      let count = 0;
      for (let i = 0; i < source.length / 16; i++) {
        instanceTransform.fromArray(source, i * 16);
        treeSphere
          .copy(mesh.geometry.boundingSphere)
          .applyMatrix4(instanceTransform);
        treeSphere.center.z += progress;
        treeSphere.radius += 2;
        const distance = Math.hypot(
          treeSphere.center.x - roadCenter(progress),
          treeSphere.center.z,
        );
        if (distance > mesh.userData.maxDistance) continue;
        if (
          !(mesh.userData.shadowAllowed && distance < 40) &&
          !viewFrustum.intersectsSphere(treeSphere)
        )
          continue;
        for (let j = 0; j < 16; j++)
          mesh.instanceMatrix.array[count * 16 + j] = source[i * 16 + j];
        if (colors)
          for (let j = 0; j < 3; j++)
            mesh.instanceColor.array[count * 3 + j] = colors[i * 3 + j];
        count++;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (colors) mesh.instanceColor.needsUpdate = true;
    }
  }
  function queueTile(index) {
    if (pending.has(index)) return;
    pending.set(index, buildTile(index));
    pump();
  }
  function pump() {
    if (preparing || !pending.size) return;
    preparing = true;
    // One bounded generation phase per idle callback; prepare two sections ahead.
    const schedule =
      globalThis.requestIdleCallback ?? ((callback) => setTimeout(callback, 0));
    schedule(
      () => {
        const [index, builder] = pending.entries().next().value ?? [];
        if (builder && builder.next().done) pending.delete(index);
        preparing = false;
        pump();
      },
      { timeout: 200 },
    );
  }
  function update(progress, time, wetness, camera) {
    currentProgress = progress;
    group.position.z = progress;
    wind.value = time;
    const biome = route.blend(progress);
    const night =
      (biome.from === "night" ? 1 - biome.mix : 0) +
      (biome.to === "night" ? biome.mix : 0);
    distantLight.value = (0.72 - wetness * 0.16) * (1 - night * 0.996);
    hasView = Boolean(camera);
    let viewStep = "";
    if (camera) {
      camera.updateMatrixWorld();
      viewMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      viewFrustum.setFromProjectionMatrix(viewMatrix);
      viewStep =
        camera.quaternion
          .toArray()
          .map((v) => Math.round(v * 40))
          .join(",") +
        ":" +
        camera.aspect;
    }
    const first = Math.floor(progress / LENGTH) - 1;
    for (let i = first; i < first + TILE_COUNT + 2; i++)
      if (!tiles.has(i) || tiles.get(i).userData.dirty) queueTile(i);
    for (const [i, tile] of tiles) {
      if (i < first || i >= first + TILE_COUNT + 2) {
        removeTile(i);
        pending.delete(i);
        continue;
      }
      tile.visible = i < first + TILE_COUNT;
      if (!tile.visible) continue;
      const lodStep = Math.floor(progress / 3) + ":" + viewStep;
      if (tile.userData.lodStep !== lodStep) {
        tile.userData.lodStep = lodStep;
        cullGroundInstances(tile, progress);
        updateLod(
          tile.userData.highTrees,
          tile.userData.lowTrees,
          tile.userData.farTrees,
          tile.userData.treePositions.broadleaf,
          progress,
        );
        updateLod(
          tile.userData.highPines,
          tile.userData.lowPines,
          tile.userData.farPines,
          tile.userData.treePositions.pine,
          progress,
        );
        tile.traverse((o) => {
          if (o.isInstancedMesh)
            o.castShadow = o.userData.shadowAllowed && i <= first + 1;
        });
      }
    }
    roadMaterial.roughness = THREE.MathUtils.lerp(0.98, 0.38, wetness);
    roadMaterial.color.setRGB(
      0.31 - 0.13 * wetness,
      0.32 - 0.13 * wetness,
      0.33 - 0.13 * wetness,
    );
  }
  function select(type) {
    const start = route.choose(type, currentProgress);
    for (const [i, tile] of tiles)
      if (i * LENGTH >= start) tile.userData.dirty = true;
    pending.clear();
    return start;
  }
  for (let i = -1; i < TILE_COUNT + 1; i++) {
    const builder = buildTile(i);
    while (!builder.next().done) {}
  }
  update(0, 0, 0);
  return {
    update,
    async prewarm(camera) {
      const warm = new THREE.Group(),
        materials = [];
      for (const parts of [
        broadleaf,
        broadleafLow,
        pine,
        pineLow,
        broadleafImpostor,
        pineImpostor,
        snowyPine,
        fern,
        grass,
        rock,
        sandstone,
        snowRock,
      ]) {
        addInstances(warm, parts, [{ position: [0, 0, 0], scale: 1 }], true);
        parts.forEach((p) => materials.push(p.material));
      }
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(new Array(12).fill(1), 3),
      );
      for (const from of Object.keys(groundMaterials))
        for (const to of Object.keys(groundMaterials)) {
          const material = blendGroundMaterial(0, {
            from,
            to,
            mix: from === to ? 0 : 0.5,
          });
          materials.push(material);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.receiveShadow = true;
          warm.add(mesh);
        }
      materials.push(roadMaterial, shoulder);
      const gpuTextures = new Set(
        materials.flatMap((m) => Object.values(m).filter((v) => v?.isTexture)),
      );
      for (const texture of gpuTextures) {
        if (texture.image?.decode) await texture.image.decode();
        renderer.initTexture(texture);
      }
      scene.add(warm);
      await renderer.compileAsync(warm, camera, scene);
      renderer.render(scene, camera);
      scene.remove(warm);
    },
    select,
    route,
    stats() {
      const totals = {};
      group.traverse((o) => {
        if (!o.isMesh || (o.layers.mask & 1) === 0) return;
        let parent = o;
        while (parent) {
          if (!parent.visible) return;
          parent = parent.parent;
        }
        const name = o.material.name || o.material.type;
        totals[name] =
          (totals[name] || 0) +
          ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
            3) *
            (o.count ?? 1);
      });
      return totals;
    },
  };
}

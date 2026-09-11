import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { roadCenter, damp } from "./driving.js";
import { createExhaust } from "./exhaust.js";
import { createCarFinish } from "./car-finish.js";

function splitWheels(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const buckets = Array.from({ length: 4 }, () =>
    Object.fromEntries(Object.keys(g.attributes).map((k) => [k, []])),
  );
  for (let i = 0; i < g.attributes.position.count; i += 3) {
    let x = 0,
      z = 0;
    for (let j = 0; j < 3; j++) {
      x += g.attributes.position.getX(i + j);
      z += g.attributes.position.getZ(i + j);
    }
    const bucket = buckets[(x < 0 ? 0 : 1) + (z < 0 ? 0 : 2)];
    for (const [name, a] of Object.entries(g.attributes))
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < a.itemSize; k++)
          bucket[name].push(a.array[(i + j) * a.itemSize + k]);
  }
  return buckets.map((bucket) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(bucket))
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values, g.attributes[name].itemSize),
      );
    return geometry;
  });
}
export async function createCar(scene, manager) {
  const loader = new GLTFLoader(manager).setDRACOLoader(
    new DRACOLoader(manager).setDecoderPath("/draco/"),
  );
  const [gltf, mirrorAsset] = await Promise.all([
    loader.loadAsync("/assets/car.glb"),
    loader.loadAsync("/assets/car-reflection.glb"),
  ]);
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gltf.scene),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  const scale = 4.79 / size.z,
    root = new THREE.Group(),
    pose = new THREE.Group(),
    body = new THREE.Group();
  root.add(pose);
  pose.add(body);
  scene.add(root);
  const finish = createCarFinish(),
    { paint, glass } = finish;
  const lampLens = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.06,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    envMapIntensity: 0.18,
  });
  const wheelMeshes = [],
    tailMaterials = [],
    materialsByName = new Map();
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.translate(-center.x, -bounds.min.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.rotateY(Math.PI);
    const name = object.material.name;
    let material = object.material.clone();
    material.roughness = Math.max(0.28, material.roughness);
    material.envMapIntensity = 0.55;
    if (
      name.includes("body151") ||
      name.includes("zx1") ||
      name.includes("livery")
    )
      material = paint;
    if (name.includes("windows")) material = glass;
    if (name.includes("headlight51")) material = lampLens;
    if (name.includes("redlight")) {
      material.emissive = new THREE.Color(0xbd0904);
      material.emissiveIntensity = 0.35;
      tailMaterials.push(material);
    }
    if (name.includes("led111") || name === "Mesheslight51Mtl") {
      material.emissive = new THREE.Color(0xf4f4dd);
      material.emissiveIntensity = 0.6;
    }
    materialsByName.set(name, material);
    if (name.includes("m8rim") || name.includes("Caliper")) {
      wheelMeshes.push({ name, geometry, material });
      return;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  });
  const wheelGroups = Array.from({ length: 4 }, () => new THREE.Group());
  const wheelParts = wheelMeshes.map((part) => ({
    ...part,
    geometries: splitWheels(part.geometry),
  }));
  const tireParts =
    wheelParts.find((p) => p.name.includes("m8rim001")) ?? wheelParts.at(-1);
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Box3().setFromBufferAttribute(
        tireParts.geometries[i].attributes.position,
      ),
      pivot = box.getCenter(new THREE.Vector3());
    const wheel = wheelGroups[i];
    wheel.position.copy(pivot);
    pose.add(wheel);
    for (const part of wheelParts) {
      const geometry = part.geometries[i];
      geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      const mesh = new THREE.Mesh(geometry, part.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wheel.add(mesh);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0,0,0,.7)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 5.8),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.042;
  root.add(shadow);
  const headlights = [];
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(0xf0f4ff, 0, 115, 0.38, 0.65, 2);
    light.position.set(side * 0.66, 0.66, -2.12);
    light.target.position.set(side * 0.6, 0.04, -70);
    light.castShadow = side === -1;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0005;
    light.shadow.needsUpdate = true;
    pose.add(light, light.target);
    headlights.push(light);
  }
  const tailGlow = new THREE.PointLight(0xff1d08, 0, 6, 2);
  tailGlow.position.set(0, 1.05, 2.85);
  pose.add(tailGlow);
  const exhaust = createExhaust(pose);
  root.traverse((o) => {
    if (o.isLight || o.isPoints) o.layers.enable(1);
  });
  mirrorAsset.scene.updateMatrixWorld(true);
  mirrorAsset.scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.translate(-center.x, -bounds.min.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.rotateY(Math.PI);
    const mesh = new THREE.Mesh(
      geometry,
      materialsByName.get(object.material.name) ?? paint,
    );
    mesh.layers.set(1);
    pose.add(mesh);
  });
  let elapsed = 0;
  function update(
    state,
    dt,
    wetness,
    precipitation = 0,
    snowFraction = 0,
    night = 0,
  ) {
    elapsed += dt;
    exhaust.update(state.exhaust ?? 0, elapsed);
    root.position.set(roadCenter(state.progress) + state.offset, 0.035, 0);
    root.rotation.y = state.heading;
    pose.rotation.y = state.bodyYaw;
    body.rotation.z = damp(
      body.rotation.z,
      -state.lateralG * 0.008 - state.steer * 0.007,
      5,
      dt,
    );
    body.rotation.x = damp(
      body.rotation.x,
      -state.acceleration * 0.0016,
      5,
      dt,
    );
    for (let i = 0; i < 4; i++) {
      const wheel = wheelGroups[i];
      wheel.rotation.y = i < 2 ? -(state.steeringAngle ?? 0) : 0;
      for (const mesh of wheel.children)
        if (!mesh.material.name.includes("Caliper"))
          mesh.rotation.x -=
            ((state.speed * dt * (state.reverse ? -1 : 1)) / 0.35) *
            (state.handbrake && i >= 2 ? 0.08 : 1);
    }
    tailMaterials.forEach(
      (m) => (m.emissiveIntensity = state.braking || state.handbrake ? 7 : 2.8),
    );
    finish.update(
      wetness,
      precipitation * (1 - snowFraction),
      state.speed,
      elapsed,
    );
    headlights.forEach((light) => {
      light.intensity = night * 4200;
      light.shadow.autoUpdate = night > 0.01;
    });
    tailGlow.intensity = night * (state.braking ? 5 : 1.5);
  }
  return {
    root,
    update,
    diagnostics: () => ({
      paint: "blue-white",
      rainEffect: "surface-film",
      headlights: headlights[0].intensity,
      reflection: "filtered-environment",
      exhaust: exhaust.diagnostics(),
    }),
  };
}

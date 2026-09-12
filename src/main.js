import "./style.css";
import * as THREE from "three";
import { createSky } from "./sky.js";
import { createWorld } from "./world.js";
import { createCar } from "./car.js";
import { createWeather } from "./weather.js";
import { createAudio } from "./audio.js";
import { createRadio } from "./radio.js";
import { createDemo } from "./demo.js";
import {
  createDrivingState,
  advanceDriving,
  roadCenter,
  damp,
} from "./driving.js";
import { LANDSCAPES } from "./route.js";
import { followCamera } from "./camera.js";
import { createWeatherState, updateWeather } from "./weather-state.js";
const $ = (s) => document.querySelector(s),
  state = createDrivingState(),
  keys = new Set();
let ready = false,
  raining = false,
  wetness = 0,
  cameraMode = 0,
  selectedLandscape = "forest",
  transitionStart = null;
const requestedMap = new URLSearchParams(location.search).get("map");
if (LANDSCAPES.includes(requestedMap)) selectedLandscape = requestedMap;
const climate = createWeatherState();
const frameTimes = new Float32Array(300);
let frameIndex = 0,
  maxWorldMs = 0,
  maxReflectionMs = 0;
function frameStats() {
  const t = Array.from(frameTimes)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  return {
    p95: t[Math.floor(t.length * 0.95)] ?? 0,
    p99: t[Math.floor(t.length * 0.99)] ?? 0,
    max: Math.max(...t),
    maxWorldMs,
    maxReflectionMs,
  };
}
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa5b4b2, 0.0045);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.setSize(innerWidth, innerHeight);
const gl = renderer.getContext();
const gpuTimer = new URLSearchParams(location.search).has("profile")
  ? gl.getExtension("EXT_disjoint_timer_query_webgl2")
  : null;
let gpuQuery = null,
  gpuMs = null,
  renderMs = 0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
$("#scene").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(
  58,
  innerWidth / innerHeight,
  0.08,
  1100,
);
camera.position.set(2, 2.25, 7.2);
const hemi = new THREE.HemisphereLight(0xd3e6f1, 0x454836, 1.5);
hemi.layers.enable(1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0ae, 3.3);
sun.position.set(-65, 65, -45);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -42,
  right: 42,
  top: 42,
  bottom: -42,
  near: 1,
  far: 210,
});
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 3;
sun.layers.enable(1);
scene.add(sun, sun.target);
const manager = new THREE.LoadingManager();
manager.onProgress = (_, loaded, total) => {
  $("#loading-detail").textContent =
    `Preparing the drive · ${Math.round((loaded / total) * 100)}%`;
};
const audio = createAudio();
const radio = createRadio(({ wanted, status }) => {
  $("#radio-status").textContent = status;
  $("#radio-play").textContent = wanted ? "Stop" : "Play";
  $("#radio-play").setAttribute(
    "aria-label",
    wanted ? "Stop radio" : "Play radio",
  );
  $("#radio-panel").classList.toggle("playing", wanted);
});
let world, car, weather, sky;
const svg = (body) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const landscapeIcons = {
  night:
    '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/><path d="M18 3v4m-2-2h4"/>',
  forest:
    '<path d="m8 2-5 8h3l-4 6h5v5m9-19-5 8h3l-4 6h5v5m-9-5h5m4 0h6l-4-6h3l-5-8"/>',
  desert:
    '<path d="M2 18c5-8 9-8 14 0M8 18c6-10 10-9 14 0M2 21h20"/><circle cx="17" cy="5" r="2"/>',
  snow: '<path d="m2 21 8-17 6 12 3-6 3 11H2Zm5-11 3 2 2-3m4 7 3 1 1-2"/>',
};
function setLandscapeIcon(type) {
  $("#landscape-icon").innerHTML = svg(landscapeIcons[type]);
}
let weatherIconIsSnow;
function setWeatherIcon(snow) {
  if (snow === weatherIconIsSnow) return;
  weatherIconIsSnow = snow;
  $("#rain").innerHTML = svg(
    snow
      ? '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>'
      : '<path d="M5 15a4 4 0 0 1-1-8 6 6 0 0 1 11-2 5 5 0 0 1 3 10H5m2 3-1 3m6-3-1 3m6-3-1 3"/>',
  );
  $("#rain").setAttribute("aria-label", snow ? "Snowfall" : "Rain");
  $("#rain").title = (snow ? "Snowfall" : "Rain") + " · R";
}
setLandscapeIcon(selectedLandscape);
$("#map").value = selectedLandscape;
setWeatherIcon(false);
$("#sound").innerHTML = svg(
  '<path d="m4 9 5 0 5-4v14l-5-4H4V9m13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
);
$("#camera").innerHTML = svg(
  '<path d="M3 7h5l2-3h4l2 3h5v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
);
$("#autopilot").innerHTML = svg(
  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m4 8 5 3m11-3-5 3m-3 4v6"/>',
);
function toggleAutopilot() {
  if (!ready) return;
  state.autopilot = !state.autopilot;
  keys.clear();
  unlockSound();
}
$("#autopilot").addEventListener("click", toggleAutopilot);
$("#radio-play").addEventListener("click", () => radio.toggle());
$("#radio-station").addEventListener("change", (event) => {
  radio.select(event.target.value);
  event.target.blur();
});
$("#radio-volume").addEventListener("input", (event) =>
  radio.setVolume(Number(event.target.value) / 100),
);
const drivingKeys = [
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowleft",
  "arrowdown",
  "arrowright",
  " ",
  "space",
  "x",
];
function unlockSound() {
  audio.unlock().catch((error) => {
    console.error(error);
    $("#sound").title = "Audio could not load. Toggle to retry.";
  });
}
async function toggleSound() {
  let enabled;
  if (!audio.diagnostics().loaded) {
    await audio.unlock();
    enabled = true;
  } else enabled = await audio.toggle();
  $("#sound").setAttribute("aria-pressed", String(enabled));
  radio.setMuted(!enabled);
}
function toggleRain() {
  raining = !raining;
  $("#rain").setAttribute("aria-checked", String(raining));
}
function chooseLandscape(type) {
  if (!world || !LANDSCAPES.includes(type)) return;
  selectedLandscape = type;
  $("#map").value = type;
  setLandscapeIcon(type);
  transitionStart = world.select(type);
}
$("#map").addEventListener("change", (e) => {
  chooseLandscape(e.target.value);
  e.target.blur();
  unlockSound();
});
$("#rain").addEventListener("click", () => {
  toggleRain();
  unlockSound();
});
$("#sound").addEventListener("click", toggleSound);
$("#camera").addEventListener(
  "click",
  () => (cameraMode = (cameraMode + 1) % 3),
);
const demo = new URLSearchParams(location.search).has("demo")
  ? createDemo({
      canvas: renderer.domElement,
      audio,
      radio,
      startDrive() {
        keys.clear();
        state.autopilot = true;
        cameraMode = 0;
        if (raining) toggleRain();
        chooseLandscape("forest");
      },
      startRain: () => {
        if (!raining) toggleRain();
      },
      startNight: () => chooseLandscape("night"),
    })
  : null;
window.addEventListener("keydown", (e) => {
  if (e.target.matches("select,input")) return;
  const key = e.key.toLowerCase();
  if (drivingKeys.includes(key)) {
    e.preventDefault();
    if (ready) keys.add(key);
    unlockSound();
  }
  if (!e.repeat) {
    if (key === "r") toggleRain();
    if (key === "m") toggleSound();
    if (key === "c") cameraMode = (cameraMode + 1) % 3;
    if (key === "h") document.body.classList.toggle("hide-ui");
    if (key === "p") toggleAutopilot();
    if (key === "b") radio.toggle();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) keys.clear();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
for (const button of document.querySelectorAll("[data-drive]")) {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    if (ready) keys.add(button.dataset.drive);
    unlockSound();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => keys.delete(button.dataset.drive));
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
async function init() {
  try {
    [world, car, sky] = await Promise.all([
      createWorld(scene, renderer, manager, selectedLandscape),
      createCar(scene, manager),
      createSky(scene, manager, renderer),
    ]);
    weather = createWeather(scene, renderer);
    const initialNight = selectedLandscape === "night" ? 1 : 0;
    car.update(
      state,
      1,
      0,
      0,
      selectedLandscape === "snow" ? 1 : 0,
      initialNight,
    );
    sky.update(0, camera, initialNight);
    sun.intensity = sunlight[selectedLandscape];
    hemi.intensity = 1.45 * (1 - initialNight * 0.982);
    scene.environmentIntensity = 0.65 * (1 - initialNight * 0.992);
    scene.fog.color.set(fogColors[selectedLandscape]);
    camera.lookAt(roadCenter(12), 0.7, -12);
    await world.prewarm(camera);
    await weather.prewarm(camera);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    ready = true;
    demo?.enable();
    last = performance.now();
    $("#loading").style.opacity = 0;
    setTimeout(() => ($("#loading").hidden = true), 600);
  } catch (error) {
    console.error(error);
    manager.onProgress = () => {};
    $("#loading strong").textContent = "The road could not load.";
    $("#loading-detail").textContent = "Reload the page to try again.";
  }
}
let lastShadow = -Infinity;
let last = performance.now(),
  elapsed = 0,
  hudTime = 0,
  fps = 60,
  measuredFrames = 0,
  measuredTime = 0;
const fogColors = {
    forest: 0xa7b3aa,
    desert: 0xcdbda4,
    snow: 0xc2ced5,
    night: 0x030611,
  },
  sunlight = { forest: 3.3, desert: 4.5, snow: 3.2, night: 0 };
function frame(now) {
  const realDt = (now - last) / 1000,
    dt = Math.min(realDt, 0.1);
  last = now;

  if (ready) {
    measuredFrames++;
    measuredTime += realDt;
    if (measuredTime >= 1) {
      fps = measuredFrames / measuredTime;
      measuredFrames = 0;
      measuredTime = 0;
    }
    frameTimes[frameIndex++ % frameTimes.length] = realDt * 1000;
    elapsed += realDt;
    advanceDriving(state, keys, wetness, realDt);
    const biome = world.route.blend(state.progress),
      mix = biome.mix,
      snowFraction =
        (biome.from === "snow" ? 1 - mix : 0) + (biome.to === "snow" ? mix : 0);
    const nightFraction =
      (biome.from === "night" ? 1 - mix : 0) + (biome.to === "night" ? mix : 0);
    demo?.update(now, nightFraction, fps);
    updateWeather(climate, raining, snowFraction, realDt);
    wetness = climate.wetness;
    let stage = performance.now();
    world.update(state.progress, elapsed, wetness, camera);
    maxWorldMs = Math.max(maxWorldMs, performance.now() - stage);
    car.update(
      state,
      dt,
      wetness,
      climate.precipitation,
      snowFraction,
      nightFraction,
    );
    weather.update(
      dt,
      elapsed,
      state,
      wetness,
      climate.precipitation,
      snowFraction,
      nightFraction,
    );
    const x = roadCenter(state.progress);
    followCamera(camera, car.root, cameraMode, state.bodyYaw);
    camera.fov = damp(camera.fov, 58 + state.speed * 0.035, 2, dt);
    camera.updateProjectionMatrix();
    stage = performance.now();
    sky.update(climate.cloud, camera, nightFraction);
    maxReflectionMs = Math.max(maxReflectionMs, performance.now() - stage);
    sun.position.set(x - 65, 65, -45);
    sun.target.position.set(x, 0, -15);
    sun.shadow.autoUpdate = false;
    if (nightFraction < 0.99 && elapsed - lastShadow > 0.065) {
      sun.shadow.needsUpdate = true;
      lastShadow = elapsed;
    }
    sun.intensity =
      THREE.MathUtils.lerp(sunlight[biome.from], sunlight[biome.to], mix) *
      (1 - 0.82 * climate.cloud);
    hemi.intensity =
      THREE.MathUtils.lerp(1.45, 1.1, climate.cloud) *
      (1 - nightFraction * 0.982);
    scene.fog.color
      .set(fogColors[biome.from])
      .lerp(new THREE.Color(fogColors[biome.to]), mix)
      .lerp(new THREE.Color(0x859194), climate.cloud * (1 - nightFraction));
    scene.fog.density = THREE.MathUtils.lerp(0.0045, 0.009, climate.cloud);
    scene.environmentIntensity =
      THREE.MathUtils.lerp(0.65, 0.45, wetness) * (1 - nightFraction * 0.992);
    audio.update(state, wetness, climate.precipitation, biome, snowFraction);
    $("#drive-prompt").style.opacity = state.distance > 3 ? "0" : "1";
    hudTime += dt;
    if (hudTime > 0.1) {
      hudTime = 0;
      $("#speed").textContent = Math.round(state.speed * 3.6);
      $("#gear").textContent = state.reverse ? "R" : state.gear;
      $("#autopilot").setAttribute("aria-pressed", String(state.autopilot));
      $("#autopilot-status").textContent = state.autopilot ? "AUTOPILOT" : "";
      $("#distance").textContent = (state.distance / 1000).toFixed(2);
      $("#boost").textContent =
        state.boost > 0.05 ? `TURBO ${(state.boost * 0.9).toFixed(1)} bar` : "";
      $("#rev-fill").style.width =
        `${Math.max(0, ((state.rpm - 850) / 7150) * 100)}%`;
      $("#weather-detail").textContent =
        climate.precipitation > 0.05
          ? `· ${snowFraction > 0.5 ? "Snow" : "Rain"}${raining ? "" : " easing"}`
          : raining
            ? "· Clouds gathering"
            : wetness > 0.05
              ? "· Drying"
              : "· Dry";
      setWeatherIcon(snowFraction > 0.5);
      $("#landscape-name").textContent = (
        mix > 0.5 ? biome.to : biome.from
      ).toUpperCase();
      $("#transition-status").textContent =
        transitionStart !== null && state.progress < transitionStart + 96
          ? `${selectedLandscape[0].toUpperCase() + selectedLandscape.slice(1)} ${state.progress < transitionStart ? "in " + Math.ceil(transitionStart - state.progress) + " m" : "ahead"}`
          : "";
      renderer.domElement.dataset.telemetry = JSON.stringify({
        ...state,
        fps: Math.round(fps),
        wetness,
        climate,
        biome,
        selectedLandscape,
        transitionStart,
      });
    }
    if (gpuQuery && gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(gpuTimer.GPU_DISJOINT_EXT))
        gpuMs = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(gpuQuery);
      gpuQuery = null;
    }
    const measureGpu = gpuTimer && !gpuQuery;
    if (measureGpu) {
      gpuQuery = gl.createQuery();
      gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT, gpuQuery);
    }
    const renderStart = performance.now();
    renderer.render(scene, camera);
    renderMs = performance.now() - renderStart;
    if (measureGpu) gl.endQuery(gpuTimer.TIME_ELAPSED_EXT);
  }
  requestAnimationFrame(frame);
}
init();
requestAnimationFrame(frame);
const modelContext = document.modelContext ?? navigator.modelContext;
if (modelContext) {
  modelContext.registerTool({
    name: "get_drive_state",
    description: "Read driving, route, weather and audio state.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () =>
      JSON.stringify({
        ...state,
        ready,
        raining,
        wetness,
        climate,
        cameraMode,
        selectedLandscape,
        transitionStart,
        biome: world?.route.blend(state.progress),
        fps: Math.round(fps),
        frameTimes: frameStats(),
        triangles: renderer.info.render.triangles,
        renderTiming: { cpuMs: renderMs, gpuMs },
        geometry: world?.stats(),
        car: car?.diagnostics(),
        audio: audio.diagnostics(),
        radio: radio.diagnostics(),
        demo: demo?.diagnostics(),
      }),
  });
  modelContext.registerTool({
    name: "set_weather",
    description:
      "Toggle precipitation: rain in forest/desert, snowfall in snow mountains.",
    inputSchema: {
      type: "object",
      properties: { rain: { type: "boolean" } },
      required: ["rain"],
    },
    execute: async ({ rain }) => {
      if (rain !== raining) toggleRain();
      return JSON.stringify({ raining });
    },
  });
  modelContext.registerTool({
    name: "select_landscape",
    description:
      "Schedule a landscape ahead on the continuous road without resetting the drive.",
    inputSchema: {
      type: "object",
      properties: { landscape: { type: "string", enum: LANDSCAPES } },
      required: ["landscape"],
    },
    execute: async ({ landscape }) => {
      chooseLandscape(landscape);
      return JSON.stringify({
        selectedLandscape,
        transitionStart,
        distance: state.distance,
        speed: state.speed,
      });
    },
  });
  modelContext.registerTool({
    name: "drive",
    description:
      "Hold driving controls for up to 8 seconds, then release them.",
    inputSchema: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          items: { type: "string", enum: ["w", "a", "s", "d", "space", "x"] },
        },
        seconds: { type: "number", minimum: 0.1, maximum: 8 },
      },
      required: ["keys", "seconds"],
    },
    execute: async (input) => {
      if (!ready) return "Game is loading.";
      const controls = input.keys.filter((k) => drivingKeys.includes(k));
      controls.forEach((k) => keys.add(k));
      await new Promise((r) =>
        setTimeout(r, Math.max(0.1, Math.min(8, input.seconds)) * 1000),
      );
      controls.forEach((k) => keys.delete(k));
      return JSON.stringify({ ...state });
    },
  });
}

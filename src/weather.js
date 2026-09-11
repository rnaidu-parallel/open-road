import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { roadCenter } from "./driving.js";
import { ROAD_GLSL } from "./road.js";

export function createWeather(scene, renderer) {
  const shader = THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms);
  Object.assign(shader, {
    wetness: { value: 0 },
    distance: { value: 0 },
    time: { value: 0 },
  });
  const reflection = new Reflector(new THREE.PlaneGeometry(210, 1300), {
    textureWidth: Math.min(384, Math.round(innerWidth * 0.4)),
    textureHeight: Math.min(216, Math.round(innerHeight * 0.4)),
    multisample: 0,
    clipBias: 0.002,
    shader: {
      uniforms: shader,
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 world;
      void main(){vUv=textureMatrix*vec4(position,1.);world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform float wetness;uniform float distance;uniform float time;varying vec4 vUv;varying vec3 world;
      ${ROAD_GLSL}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        float s=distance-world.z;float center=roadCenterAt(s);float x=abs(world.x-center);
        if(x>3.79||x<.21||(x>3.46&&x<3.63))discard;
        float puddle=smoothstep(.36,.74,noise(vec2(world.x*.75,s*.12)));
        vec4 coord=vUv;coord.xy+=vec2(sin(s*31.+time*9.),cos(world.x*45.+time*7.))*.00004*coord.w;
        vec2 blur=vec2(.0035,.004)*coord.w;
        vec3 reflected=texture2DProj(tDiffuse,coord).rgb*.4;
        reflected+=texture2DProj(tDiffuse,coord+vec4(blur.x,0.,0.,0.)).rgb*.15;
        reflected+=texture2DProj(tDiffuse,coord-vec4(blur.x,0.,0.,0.)).rgb*.15;
        reflected+=texture2DProj(tDiffuse,coord+vec4(0.,blur.y,0.,0.)).rgb*.15;
        reflected+=texture2DProj(tDiffuse,coord-vec4(0.,blur.y,0.,0.)).rgb*.15;
        float fresnel=.32+.68*pow(1.-clamp(cameraPosition.y/length(cameraPosition-world),0.,1.),3.);
        gl_FragColor=vec4(reflected*.83,wetness*(.10+.42*puddle)*fresnel);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    },
  });
  const reflectScene = reflection.onBeforeRender;
  reflection.onBeforeRender = function (renderer, scene, camera) {
    this.getReflectionCamera(camera).layers.set(1);
    reflectScene.call(this, renderer, scene, camera);
  };
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set(0, 0.043, -250);
  reflection.material.transparent = true;
  reflection.material.depthWrite = false;
  reflection.renderOrder = 1;
  reflection.visible = false;
  scene.add(reflection);
  const count = 3200,
    positions = new Float32Array(count * 6),
    drops = [];
  for (let i = 0; i < count; i++)
    drops.push({
      x: (Math.random() - 0.5) * 65,
      y: Math.random() * 28,
      z: (Math.random() - 0.5) * 80,
    });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const rain = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xb8cbd1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  rain.frustumCulled = false;
  scene.add(rain);
  const splashCount = 260,
    splashPositions = new Float32Array(splashCount * 3),
    phases = new Float32Array(splashCount);
  for (let i = 0; i < splashCount; i++) phases[i] = Math.random();
  const splashGeo = new THREE.BufferGeometry();
  splashGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(splashPositions, 3),
  );
  splashGeo.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  const splashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      wetness: { value: 0 },
      pixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `attribute float phase;uniform float time;uniform float pixelRatio;varying float age;void main(){age=fract(phase+time*.7);vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=(1.+age*7.)*pixelRatio*(10./max(3.,-p.z));gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float wetness;varying float age;void main(){float d=length(gl_PointCoord-.5)*2.;float ring=smoothstep(.55,.75,d)*(1.-smoothstep(.8,1.,d));gl_FragColor=vec4(.7,.8,.83,ring*(1.-age)*wetness*.32);}`,
  });
  const splashes = new THREE.Points(splashGeo, splashMat);
  splashes.frustumCulled = false;
  scene.add(splashes);
  const sprayCount = 320,
    sprayPositions = new Float32Array(sprayCount * 3),
    sprayAlpha = new Float32Array(sprayCount);
  const particles = Array.from({ length: sprayCount }, () => ({ life: 0 }));
  let particleIndex = 0,
    emission = 0;
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(sprayPositions, 3),
  );
  sprayGeo.setAttribute("alpha", new THREE.BufferAttribute(sprayAlpha, 1));
  const sprayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { light: { value: 1 } },
    vertexShader: `attribute float alpha;varying float opacity;void main(){opacity=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=70./max(2.,-p.z);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float light;varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vec3(.65,.7,.74)*light,(1.-smoothstep(.0,1.,r))*opacity*.12);}`,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  scene.add(spray);
  const markPositions = new Float32Array(500 * 18),
    markGeometry = new THREE.BufferGeometry();
  markGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(markPositions, 3),
  );
  markGeometry.setDrawRange(0, 0);
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0x111212,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const marks = new THREE.Mesh(markGeometry, markMaterial);
  marks.frustumCulled = false;
  scene.add(marks);
  let markIndex = 0,
    markCount = 0,
    previousTyres = null;
  const snowPositions = new Float32Array(1800 * 3),
    snowSeeds = Array.from({ length: 1800 }, () => ({
      x: (Math.random() - 0.5) * 55,
      y: Math.random() * 25,
      z: (Math.random() - 0.5) * 75,
    }));
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(snowPositions, 3),
  );
  const snowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      amount: { value: 0 },
      pixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `uniform float pixelRatio;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(28.*pixelRatio/max(2.,-mv.z),1.,7.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float amount;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.92,.96,1.,(1.-smoothstep(.25,1.,r))*amount*.75);}`,
  });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.frustumCulled = false;
  scene.add(snow);
  return {
    reflection,
    async prewarm(camera) {
      const objects = [reflection, rain, splashes, spray, snow],
        visibility = objects.map((o) => o.visible);
      objects.forEach((o) => (o.visible = true));
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      objects.forEach((o, i) => (o.visible = visibility[i]));
    },
    update(
      dt,
      time,
      state,
      wetness,
      precipitation,
      snowFraction = 0,
      night = 0,
    ) {
      reflection.visible = wetness > 0.015;
      reflection.material.uniforms.wetness.value = wetness;
      reflection.material.uniforms.distance.value = state.progress;
      reflection.material.uniforms.time.value = time;
      const amount = precipitation * (1 - snowFraction);
      snow.visible = precipitation * snowFraction > 0.005;
      snowMaterial.uniforms.amount.value = precipitation * snowFraction;
      for (let i = 0; i < snowSeeds.length; i++) {
        const p = snowSeeds[i];
        p.y = (p.y - dt * (1.25 + (i % 5) * 0.13) + 25) % 25;
        p.z = ((p.z + dt * state.speed + 37.5) % 75) - 37.5;
        snowPositions.set(
          [
            roadCenter(state.progress) +
              state.offset +
              p.x +
              Math.sin(time * 0.7 + i) * 0.7,
            p.y,
            p.z,
          ],
          i * 3,
        );
      }
      snowGeometry.attributes.position.needsUpdate = true;
      rain.visible = amount > 0.01;
      rain.material.opacity = amount * 0.22;
      for (let i = 0; i < count; i++) {
        const drop = drops[i];
        drop.y = (drop.y - dt * 23 + 28) % 28;
        drop.z = ((drop.z + dt * state.speed + 40) % 80) - 40;
        const j = i * 6;
        positions[j] = drop.x + state.offset + roadCenter(state.progress);
        positions[j + 1] = drop.y;
        positions[j + 2] = drop.z;
        positions[j + 3] = positions[j] + 0.06;
        positions[j + 4] = drop.y - 0.75;
        positions[j + 5] = drop.z - 0.12;
      }
      geometry.attributes.position.needsUpdate = true;
      splashes.visible = amount > 0.01;
      splashMat.uniforms.time.value = time;
      splashMat.uniforms.wetness.value = amount;
      for (let i = 0; i < splashCount; i++) {
        const z = -((i / splashCount) * 70) + 8;
        const s = state.progress - z;
        splashPositions[i * 3] = roadCenter(s) + Math.sin(i * 173.73) * 3.6;
        splashPositions[i * 3 + 1] = 0.075;
        splashPositions[i * 3 + 2] = z;
      }
      splashGeo.attributes.position.needsUpdate = true;
      const heading = state.heading ?? 0,
        sin = Math.sin(heading),
        cos = Math.cos(heading),
        carX = roadCenter(state.progress) + state.offset;
      const tyres = [-1, 1].map((side) => ({
        x: carX + side * 0.82 * cos + 1.5 * sin,
        s: state.progress + side * 0.82 * sin - 1.5 * cos,
      }));
      const sprayAmount =
        Math.min(1, wetness + state.driftAmount * 0.8 + snowFraction * 0.3) *
        Math.min(1, state.speed / 18);
      emission += dt * 160 * sprayAmount;
      while (emission >= 1) {
        const p = particles[particleIndex++ % sprayCount],
          tyre = tyres[particleIndex % 2];
        Object.assign(p, {
          life: 1.2,
          x: tyre.x,
          s: tyre.s,
          y: 0.12,
          vx: (Math.random() - 0.5) * 0.65,
          vs: (Math.random() - 0.5) * 0.55,
          vy: 0.35 + Math.random() * 0.45,
          amount: sprayAmount,
        });
        emission--;
      }
      for (let i = 0; i < sprayCount; i++) {
        const p = particles[i];
        p.life = Math.max(0, p.life - dt);
        sprayAlpha[i] = (p.life / 1.2) * (p.amount ?? 0);
        if (p.life > 0) {
          p.x += p.vx * dt;
          p.s += p.vs * dt;
          p.y += p.vy * dt;
          sprayPositions.set([p.x, p.y, state.progress - p.s], i * 3);
        }
      }
      sprayMat.uniforms.light.value = 1 - night * 0.96;
      sprayGeo.attributes.position.needsUpdate = true;
      sprayGeo.attributes.alpha.needsUpdate = true;
      const skidding =
        (state.driftAmount > 0.12 || state.handbrake) && state.speed > 5;
      if (skidding && previousTyres) {
        const travelled = Math.hypot(
          tyres[0].x - previousTyres[0].x,
          tyres[0].s - previousTyres[0].s,
        );
        if (travelled > 0.25) {
          for (let i = 0; i < 2; i++) {
            const a = previousTyres[i],
              b = tyres[i],
              dx = b.x - a.x,
              dz = -(b.s - a.s),
              length = Math.max(0.001, Math.hypot(dx, dz)),
              nx = (-dz / length) * 0.12,
              nz = (dx / length) * 0.12;
            markPositions.set(
              [
                a.x + nx,
                0.041,
                -a.s + nz,
                a.x - nx,
                0.041,
                -a.s - nz,
                b.x + nx,
                0.041,
                -b.s + nz,
                b.x + nx,
                0.041,
                -b.s + nz,
                a.x - nx,
                0.041,
                -a.s - nz,
                b.x - nx,
                0.041,
                -b.s - nz,
              ],
              (markIndex++ % 500) * 18,
            );
            markCount = Math.min(500, markCount + 1);
          }
          markGeometry.setDrawRange(0, markCount * 6);
          markGeometry.attributes.position.needsUpdate = true;
          previousTyres = tyres;
        }
      } else previousTyres = skidding ? tyres : null;
      marks.position.z = state.progress;
      markMaterial.opacity = 0.28 * (1 - wetness * 0.85);
    },
  };
}

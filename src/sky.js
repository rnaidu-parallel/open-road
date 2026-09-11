import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export async function createSky(scene, manager, renderer) {
  const loader = new HDRLoader(manager);
  const [clear, storm] = await Promise.all([
    loader.loadAsync("/assets/sky.hdr"),
    loader.loadAsync("/assets/storm.hdr"),
  ]);
  clear.mapping = storm.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const clearEnvironment = pmrem.fromEquirectangular(clear),
    stormEnvironment = pmrem.fromEquirectangular(storm);
  pmrem.dispose();
  // Blend already filtered radiance, without recapturing moving cube faces.
  const environment = new THREE.WebGLRenderTarget(
    clearEnvironment.width,
    clearEnvironment.height,
    { type: THREE.HalfFloatType, depthBuffer: false },
  );
  environment.texture.mapping = THREE.CubeUVReflectionMapping;
  const blendMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      clearMap: { value: clearEnvironment.texture },
      stormMap: { value: stormEnvironment.texture },
      cloud: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:
      "varying vec2 vUv;uniform sampler2D clearMap;uniform sampler2D stormMap;uniform float cloud;void main(){gl_FragColor=mix(texture2D(clearMap,vUv),texture2D(stormMap,vUv),cloud);}",
  });
  const blendScene = new THREE.Scene();
  blendScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMaterial));
  const blendCamera = new THREE.Camera();
  let previousCloud = -1;
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  scene.environmentRotation.y = 0.8;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      clearSky: { value: clear },
      stormSky: { value: storm },
      wetness: { value: 0 },
      night: { value: 0 },
    },
    vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D clearSky;uniform sampler2D stormSky;uniform float wetness;uniform float night;varying vec3 direction;
  void main(){vec3 d=normalize(direction);vec3 color=vec3(0.);
  if(night<.999){vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5+.1273,asin(clamp(d.y,-1.,1.))/3.14159265+.5);color=mix(texture2D(clearSky,uv).rgb*.7,texture2D(stormSky,uv).rgb*.42,wetness);}
  if(night>.001){vec3 moonDirection=normalize(vec3(-.07,.22,-1.));float moonDistance=length(d-moonDirection);float moon=1.-smoothstep(.016,.017,moonDistance);float halo=exp(-moonDistance*35.)*.035;float crater=.76+.12*sin(d.x*930.)*sin(d.y*700.)+.10*sin(d.z*1200.);vec3 dark=mix(vec3(.003,.005,.014),vec3(.012,.021,.044),pow(1.-max(0.,d.y),4.));dark+=vec3(.82,.89,1.)*(moon*crater*.9+halo)*(1.-wetness*.8);color=mix(color,dark,night);}
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
  dome.frustumCulled = false;
  dome.layers.enable(1);
  scene.add(dome);
  const starPositions = new Float32Array(2100 * 3),
    starSizes = new Float32Array(2100);
  for (let i = 0; i < 2100; i++) {
    const a = i * 2.39996323,
      y = 0.03 + 0.96 * ((((Math.sin(i * 137.17) * 43758.5) % 1) + 1) % 1),
      r = Math.sqrt(1 - y * y);
    starPositions.set(
      [Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850],
      i * 3,
    );
    starSizes[i] = 1.1 + (i % 11 === 0 ? 1.3 : 0.2);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  starGeometry.setAttribute(
    "starSize",
    new THREE.BufferAttribute(starSizes, 1),
  );
  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { amount: { value: 0 } },
    vertexShader: `attribute float starSize;varying float hide;void main(){hide=step(.025,length(normalize(position)-normalize(vec3(-.07,.22,-1.))));gl_PointSize=starSize;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float amount;varying float hide;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.78,.86,1.,a*amount*hide);}`,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scene.add(stars);

  return {
    update(wetness, camera, night = 0) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      starMaterial.uniforms.amount.value = night * (1 - wetness * 0.96);
      material.uniforms.wetness.value = wetness;
      material.uniforms.night.value = night;
      if (Math.abs(wetness - previousCloud) > 0.003) {
        previousCloud = wetness;
        blendMaterial.uniforms.cloud.value = wetness;
        const target = renderer.getRenderTarget();
        renderer.setRenderTarget(environment);
        renderer.render(blendScene, blendCamera);
        renderer.setRenderTarget(target);
      }
    },
  };
}

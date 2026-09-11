import * as THREE from "three";

export function createExhaust(parent) {
  const positions = new Float32Array(36 * 3);
  const ages = new Float32Array(36);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute("age", new THREE.BufferAttribute(ages, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      strength: { value: 0 },
      height: { value: innerHeight },
    },
    vertexShader: `attribute float age;varying float life;uniform float height;void main(){life=age;vec4 view=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp((.075-.045*age)*projectionMatrix[1][1]*height*.5/max(.1,-view.z),1.,32.);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `varying float life;uniform float strength;uniform float time;void main(){vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);float softness=exp(-r*r*4.)*(1.-smoothstep(.6,1.,r));float turbulence=.8+.2*sin(p.x*8.+life*21.-time*29.)*sin(p.y*7.+time*13.);vec3 color=mix(vec3(.12,.35,1.),vec3(1.,.36,.08),smoothstep(.08,.5,life));color=mix(color,vec3(1.,.85,.56),exp(-r*r*16.)*.3);gl_FragColor=vec4(color*1.7,softness*turbulence*(1.-life*.7)*strength*.38);}`,
  });
  const flame = new THREE.Points(geometry, material);
  flame.frustumCulled = false;
  flame.visible = false;
  parent.add(flame);
  const glow = new THREE.PointLight(0xff8738, 0, 2.5, 2);
  glow.position.set(0, 0.25, 2.65);
  parent.add(glow);
  const tips = [
    [-0.31, 0.29],
    [-0.12, 0.17],
    [0.12, 0.17],
    [0.31, 0.29],
  ];
  let bursts = 0,
    previous = 0;
  return {
    update(amount, time) {
      if (amount > previous + 0.2) bursts++;
      previous = amount;
      flame.visible = amount > 0.025;
      material.uniforms.time.value = time;
      material.uniforms.strength.value = amount;
      material.uniforms.height.value = innerHeight;
      for (let i = 0; i < 36; i++) {
        const age = (i % 9) / 9,
          tip = tips[Math.floor(i / 9)];
        ages[i] = age;
        positions.set(
          [
            tip[0] + Math.sin(i * 7 + time * 15) * 0.008 * age,
            tip[1] + age * 0.035,
            2.39 + age * (0.12 + amount * 0.28),
          ],
          i * 3,
        );
      }
      geometry.attributes.position.needsUpdate = true;
      glow.intensity = amount * 0.4;
    },
    diagnostics: () => ({
      bursts,
      strength: material.uniforms.strength.value,
      style: "soft-plume",
    }),
  };
}

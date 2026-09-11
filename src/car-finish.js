import * as THREE from "three";

// Car-space paint avoids UV seams between the original model's body panels.
// Water changes surface normals and roughness; it never draws floating sprites.
export function createCarFinish() {
  const water = { value: 0 },
    rain = { value: 0 },
    time = { value: 0 },
    flow = { value: 0 };
  const paint = new THREE.MeshPhysicalMaterial({
    name: "Blue and white racing livery",
    color: 0xe2e6ed,
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.68,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x24323d,
    metalness: 0.04,
    roughness: 0.08,
    transparent: true,
    opacity: 0.76,
    envMapIntensity: 0.6,
    depthWrite: false,
  });
  const blue = new THREE.Color(0x154798);
  for (const material of [paint, glass]) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        surfaceWater: water,
        surfaceRain: rain,
        surfaceTime: time,
        waterFlow: flow,
        liveryBlue: { value: blue },
      });
      shader.vertexShader =
        "varying vec3 carPoint;varying vec3 carNormal;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n carPoint=position;carNormal=normal;",
      );
      shader.fragmentShader =
        `varying vec3 carPoint;varying vec3 carNormal;
    uniform float surfaceWater;uniform float surfaceRain;uniform float surfaceTime;uniform float waterFlow;uniform vec3 liveryBlue;
    vec2 beadHash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
    float waterSurface(vec2 uv){
     vec2 cell=floor(uv*85.),p=fract(uv*85.);vec2 seed=beadHash(cell);
     vec2 d=p-(.22+seed*.56);float radius=.10+seed.x*.13;
     float footprint=length(d/vec2(radius,radius*(1.+waterFlow*.35)));
     float bead=pow(max(0.,1.-footprint*footprint),1.5)*.00018;
     float resolution=1.-smoothstep(.25,.9,length(fwidth(uv*85.)));
     // Short-lived, millimetre-height disturbances attached to the wet surface.
     float age=fract(surfaceTime*.67+seed.y*5.);
     float hit=exp(-age*32.)*sin(length(d)*55.-age*20.)*.000003*surfaceRain;
     return (bead+hit)*resolution*surfaceWater;
    }
   ` + shader.fragmentShader;
      if (material === paint) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
     float side=smoothstep(.55,.82,abs(carPoint.x));
     float diagonal=.70-carPoint.z*.20;
     float mainBand=(1.-smoothstep(.16,.18,abs(carPoint.y-diagonal)))*side;
     float lowerBand=(1.-smoothstep(.027,.038,abs(carPoint.y-diagonal+.25)))*side;
     float top=(1.-side)*(1.-smoothstep(.35,.37,abs(carPoint.x+.12)));
     float rear=smoothstep(1.72,1.9,carPoint.z)*(1.-smoothstep(.32,.35,abs(carPoint.x+.12)));
     diffuseColor.rgb=mix(diffuseColor.rgb,liveryBlue,max(max(mainBand,lowerBand),max(top,rear)));
    `,
        );
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
    vec3 cn=normalize(carNormal);vec2 waterUv=abs(cn.y)>.45?carPoint.xz:vec2(carPoint.z,-carPoint.y*.65);
    float height=waterSurface(waterUv);
    vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
    vec3 rx=cross(sy,normal),ry=cross(normal,sx);
    float determinant=dot(sx,rx);
    vec3 gradient=sign(determinant)*(dFdx(height)*rx+dFdy(height)*ry);
    normal=normalize(abs(determinant)*normal-gradient);
   `,
      );
    };
    material.customProgramCacheKey = () =>
      material === paint ? "blue-white-water" : "glass-water";
  }
  return {
    paint,
    glass,
    update(wetness, precipitation, speed, elapsed) {
      water.value = wetness;
      rain.value = precipitation;
      flow.value = Math.min(1, speed / 55);
      time.value = elapsed;
      paint.roughness = 0.3 - wetness * 0.04;
      paint.clearcoatRoughness = 0.16;
      glass.roughness = 0.1;
    },
  };
}

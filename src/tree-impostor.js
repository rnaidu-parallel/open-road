import * as THREE from "three";

// A distant tree uses an albedo view baked from the same scanned model.
// It is drawn as one upright, camera-facing card, with scene fog and daylight.
export function bakeTreeImpostor(parts, renderer, light, wind) {
  const bakeScene = new THREE.Scene();
  const bounds = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    bounds.union(part.geometry.boundingBox);
    bakeScene.add(
      new THREE.Mesh(
        part.geometry,
        new THREE.MeshBasicMaterial({
          map: part.material.map,
          color: part.material.color,
          alphaMap: part.material.alphaMap,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
        }),
      ),
    );
  }
  const size = bounds.getSize(new THREE.Vector3());
  const width = size.x * 1.08,
    height = size.y * 1.08;
  const target = new THREE.WebGLRenderTarget(512, 1024, {
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
  });
  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    10,
  );
  camera.position.set(0, size.y / 2, 3);
  camera.lookAt(0, size.y / 2, 0);
  const oldTarget = renderer.getRenderTarget(),
    oldColor = renderer.getClearColor(new THREE.Color()),
    oldAlpha = renderer.getClearAlpha();
  const toneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0, 0);
  renderer.setRenderTarget(target);
  renderer.render(bakeScene, camera);
  renderer.setRenderTarget(oldTarget);
  renderer.setClearColor(oldColor, oldAlpha);
  renderer.toneMapping = toneMapping;
  bakeScene.children.forEach((mesh) => mesh.material.dispose());
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, size.y / 2, 0);
  const material = new THREE.ShaderMaterial({
    name: "Distant tree canopy",
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      map: { value: target.texture },
      brightness: light,
      windTime: wind,
    },
    vertexShader: `varying vec2 vUv;uniform float windTime;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec3 center=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;vec3 right=normalize(vec3(cameraPosition.z-center.z,0.,center.x-cameraPosition.x));float scale=length(instanceMatrix[1].xyz);vec3 world=center+right*position.x*scale+vec3(0.,position.y*scale,0.);world.x+=sin(windTime*.8+center.x*.03+center.z*.01)*.015*position.y*scale;vec4 mvPosition=viewMatrix*vec4(world,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D map;uniform float brightness;
      #include <fog_pars_fragment>
      void main(){vec4 color=texture2D(map,vUv);if(color.a<.18)discard;gl_FragColor=vec4(color.rgb*brightness,color.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  return [{ geometry, material }];
}

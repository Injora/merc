import { Color, MeshPhysicalMaterial, Plane, Vector3 } from 'three'

/** world-space height of the emblem centre (EMBLEM_POS.y) */
const SWEEP_CENTRE_Y = 1.15

/**
 * Shared materials (the chrome of the star and its fragments). Created once
 * per Stage, disposed with it. The reveal clipping plane is shared too, so
 * every part of the car materialises behind the same moving edge.
 */
export function createMaterials() {
  const revealPlane = new Plane(new Vector3(0, 0, -1), -10)

  // polished chrome: pure metal, near-mirror, no clearcoat (a coat on chrome only adds a second, dimmer reflection)
  const chrome = new MeshPhysicalMaterial({
    color: new Color('#f4f6f8'),
    metalness: 1,
    roughness: 0.055,
    envMapIntensity: 1.6,
  })

  // the emblem's own chrome: identical, plus one deterministic studio sweep — a soft
  // diagonal band of light that crosses the star in world space (uSweep −1.2 → 1.2),
  // strongest on the facets that face the (virtual) softbox. No env re-render needed.
  const sweep = { value: -9 }
  const emblemChrome = chrome.clone()
  emblemChrome.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = sweep
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSweepW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n#ifndef SQ_DEFINED\n#define SQ_DEFINED\n#define sq(x) ((x) * (x))\n#endif\nvarying vec3 vSweepW;\nuniform float uSweep;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float d = dot(vSweepW.xy - vec2(0.0, ${SWEEP_CENTRE_Y.toFixed(3)}), normalize(vec2(1.0, 0.42)));
          float band = exp(-sq((d - uSweep) / 0.075));
          float face = smoothstep(-0.1, 0.9, dot(normal, normalize(vec3(-0.35, 0.45, 0.82))));
          outgoingLight += vec3(0.93, 0.96, 1.0) * band * (0.15 + 1.15 * face);
        }
        #include <opaque_fragment>`,
      )
  }
  emblemChrome.customProgramCacheKey = () => 'emblem-sweep'

  const all = [chrome, emblemChrome]

  return {
    revealPlane,
    chrome,
    emblemChrome,
    /** emblem sweep position (world units along the diagonal); park at −9 when idle */
    emblemSweep: sweep,
    dispose: () => all.forEach((m) => m.dispose()),
  }
}

export type Materials = ReturnType<typeof createMaterials>

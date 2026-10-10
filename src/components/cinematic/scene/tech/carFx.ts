import type { Material, Object3D, Mesh } from 'three'
import { S } from '../../../../lib/state'

/** half the car's length: the scan parameter (−1 nose … 1 tail) maps to world z */
export const CAR_HALF = 2.4

/** Uniforms shared by every material of the car (one object: updating it updates all). */
export const CARFX = {
  uScanZ: { value: -9 },
  uScanOn: { value: 0 },
  uXray: { value: 0 },
  uGhost: { value: 0 },
}

/** Push the scrubbed state into the shared uniforms (once per frame). */
export function updateCarFx() {
  const t = S.tech
  CARFX.uScanZ.value = t.scan * CAR_HALF
  CARFX.uScanOn.value = t.scanOn
  CARFX.uXray.value = t.xray
  CARFX.uGhost.value = t.ghost
}

/**
 * The scan and the digital X-ray, injected into every material of the car:
 *  - a thin band of cool light where the scan gate crosses the bodywork;
 *  - behind the gate (towards the nose, already scanned) the paint dissolves,
 *    with a fine bright edge where it is dissolving.
 * The dissolve uses a stable per-pixel threshold (interleaved gradient noise on
 * gl_FragCoord), so it never shimmers from frame to frame; and it is opaque
 * (discard), so there is no transparency sorting or overdraw.
 */
export function applyCarFx(root: Object3D) {
  const done = new Set<Material>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(m)) continue
      done.add(m)
      const prev = m.onBeforeCompile
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r)
        Object.assign(sh.uniforms, CARFX)
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vCarW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvCarW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
#ifndef SQ_DEFINED
            #define SQ_DEFINED
            #define sq(x) ((x) * (x))
            #endif
            
            varying vec3 vCarW;
            uniform float uScanZ, uScanOn, uXray, uGhost;
            float carDissolve() {
              // scanned = nearer the nose than the gate; fully dissolved a short way behind it
              float behind = clamp((uScanZ - vCarW.z) / 0.45, 0.0, 1.0);
              return max(uGhost, behind * uXray);
            }`,
          )
          .replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            float carIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            float carD = carDissolve();
            if (carIgn < carD) discard;`,
          )
          .replace(
            '#include <opaque_fragment>',
            `{
              // the gate's line of light on the bodywork, and the glowing edge of the dissolve
              float gate = exp(-sq((vCarW.z - uScanZ) / 0.035)) * uScanOn;
              float edge = (1.0 - smoothstep(0.0, 0.08, carIgn - carD)) * step(0.001, carD) * (1.0 - uGhost);
              outgoingLight += vec3(0.62, 0.82, 1.0) * (gate * 1.0 + edge * 0.55);
            }
            #include <opaque_fragment>`,
          )
      }
      const key = m.customProgramCacheKey?.bind(m)
      m.customProgramCacheKey = () => `${key ? key() : ''}|carfx`
      m.needsUpdate = true
    }
  })
}

import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'
import { S } from '../../../lib/state'
import { samplePalette } from './palettes'

/**
 * The sky of the real-time scenes: a procedural gradient from the palette
 * (studio black → the night road → the finale), with a hairline horizon
 * that brightens as the road turns to light.
 */
export function createSkyMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color('#000') },
      uHorizon: { value: new Color('#000') },
      uGround: { value: new Color('#000') },
      uSunDir: { value: new Vector3(0, 0.2, 1).normalize() },
      uSun: { value: new Color('#fff') },
      uSunIntensity: { value: 0 },
      uDigital: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGround, uSun, uSunDir;
      uniform float uSunIntensity, uDigital, uFade;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
        col = mix(col, uGround, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSun * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.8 + pow(s, 900.0) * 6.0) * uSunIntensity * 0.35;
        col += uHorizon * exp(-abs(h) * 28.0) * 0.35;

        // the finale: one hairline horizon, brightest straight ahead (where the car vanishes)
        float ahead = pow(clamp(-d.z, 0.0, 1.0), 6.0);
        float line = exp(-abs(h - 0.002) * 2200.0) * ahead;
        col += vec3(0.62, 0.88, 1.0) * line * 0.75 * uDigital;
        gl_FragColor = vec4(col * uFade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Push the current story state into a sky material. */
export function updateSkyMaterial(m: ShaderMaterial) {
  const pal = samplePalette(S.sky)
  const u = m.uniforms
  ;(u.uTop.value as Color).copy(pal.skyTop)
  ;(u.uHorizon.value as Color).copy(pal.skyHorizon)
  ;(u.uGround.value as Color).copy(pal.ground)
  ;(u.uSun.value as Color).copy(pal.sun)
  ;(u.uSunDir.value as Vector3).set(...pal.sunDir).normalize()
  u.uSunIntensity.value = pal.sunIntensity
  u.uDigital.value = S.digital
}

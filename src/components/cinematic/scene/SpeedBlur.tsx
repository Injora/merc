import { useFrame, useThree } from '@react-three/fiber'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { forwardRef, useMemo } from 'react'
import { Uniform, Vector2, type PerspectiveCamera } from 'three'
import { S } from '../../../lib/state'

/**
 * Speed blur for the finale's run to the horizon, masked by depth: only the
 * road beyond the car streaks (radially). Taps that land on near geometry —
 * the car — are rejected, so nothing in the foreground smears or bleeds.
 */
const fragment = /* glsl */ `
uniform float uStrength;
uniform vec2 uDir;
uniform float uRadial;
uniform vec2 uCenter;
uniform float uThreshold;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (uStrength < 0.0005 || depth < uThreshold) {
    outputColor = inputColor;
    return;
  }
  vec2 dir = mix(uDir, (uv - uCenter) * 1.4, uRadial) * uStrength;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -7; i <= 7; i++) {
    vec2 o = uv + dir * (float(i) / 7.0);
    float w = step(uThreshold, readDepth(o)) * (1.0 - abs(float(i)) / 9.0);
    acc += texture2D(inputBuffer, o).rgb * w;
    wsum += w;
  }
  outputColor = vec4(wsum > 0.0 ? acc / wsum : inputColor.rgb, inputColor.a);
}
`

class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uStrength', new Uniform(0)],
        ['uDir', new Uniform(new Vector2(1, 0))],
        ['uRadial', new Uniform(0)],
        ['uCenter', new Uniform(new Vector2(0.5, 0.55))],
        ['uThreshold', new Uniform(0.99)],
      ]),
    })
  }
}

/** Depth-buffer value of a view distance (standard perspective projection, 0–1). */
function depthAt(distance: number, near: number, far: number) {
  return (1 / near - 1 / distance) / (1 / near - 1 / far)
}

export const SpeedBlur = forwardRef<SpeedBlurEffect>(function SpeedBlur(_, ref) {
  const effect = useMemo(() => new SpeedBlurEffect(), [])
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useFrame(() => {
    const u = effect.uniforms
    const onRoad = S.road > 0.5
    const speed = onRoad ? S.speed + S.scrollVelocity * 25 : 0
    u.get('uStrength')!.value = onRoad ? Math.min(1, speed / 60) * 0.03 + Math.min(1, S.scrollVelocity) * 0.012 : 0
    u.get('uRadial')!.value = 1 // the finale camera looks forward down the road
    // the car itself (and anything nearer) stays sharp
    u.get('uThreshold')!.value = depthAt(11, camera.near, camera.far)
  })

  return <primitive ref={ref} object={effect} dispose={null} />
})

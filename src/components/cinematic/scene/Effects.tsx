import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { SpeedBlur } from './SpeedBlur'

/**
 * Restrained grading, decided once per device tier: bloom on the hottest
 * highlights only (specular glints, lamps, the finale's lines), ACES filmic
 * tone mapping, a soft lens vignette and a whisper of grain.
 */
export function Effects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <SpeedBlur />
      <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1.15} luminanceSmoothing={0.1} radius={0.68} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.72} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.07} />
    </EffectComposer>
  )
}

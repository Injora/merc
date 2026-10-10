import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useEffect, useRef } from 'react'
import { Color, Fog, Vector3, type DirectionalLight, type HemisphereLight, type PerspectiveCamera, type Scene } from 'three'
import { S } from '../../../lib/state'
import { samplePalette } from './palettes'
import { FX_LAYER } from './StudioSet'

/**
 * Applies the scrubbed story state to the camera, the atmosphere and the
 * global lights every frame. All per-frame work, zero React renders.
 */
export function Director() {
  const hemi = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const scene = useThree((s) => s.scene) as Scene
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const fogRef = useRef<Fog>(new Fog('#000', 9, 34))
  const bg = useRef(new Color('#000'))
  // damped camera state (frame-rate independent): position, look target, field of view
  const cam = useRef({ pos: new Vector3(), look: new Vector3(), want: new Vector3(), wantLook: new Vector3(), fov: { v: 35 }, ready: false })

  useEffect(() => {
    camera.layers.enable(FX_LAYER) // see StudioSet: decals and glows render for the camera, not for shadow bakes
  }, [camera])

  useFrame((state, delta) => {
    S.frame++
    const pal = samplePalette(S.sky)

    // ── atmosphere ──
    if (scene.fog !== fogRef.current) scene.fog = fogRef.current
    fogRef.current.color.copy(pal.fog)
    fogRef.current.near = pal.fogNear
    fogRef.current.far = pal.fogFar
    bg.current.copy(pal.skyTop)
    scene.background = bg.current
    scene.environmentIntensity = pal.env

    if (hemi.current) {
      hemi.current.color.copy(pal.hemiSky)
      hemi.current.groundColor.copy(pal.hemiGround)
      hemi.current.intensity = pal.hemi
    }
    if (sun.current) {
      sun.current.color.copy(pal.sun)
      sun.current.intensity = pal.sunIntensity
      sun.current.position.set(pal.sunDir[0] * 30, pal.sunDir[1] * 30, pal.sunDir[2] * 30)
    }

    // ── camera ──
    // A locked-off camera: position, target and FOV come only from the timeline (damped).
    // No pointer parallax, no ignition shake, no road vibration — the engine is heard, not seen.
    const c = S.cam
    const k = cam.current
    k.want.set(c.px, c.py, c.pz + S.ignCamZ)
    k.wantLook.set(c.tx, c.ty, c.tz)

    // keep horizontal framing on portrait screens
    const aspect = state.size.width / Math.max(1, state.size.height)
    let fov = c.fov
    if (aspect < 1.3) {
      const h = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 1.3)
      fov = Math.min(68, ((2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI) * 0.82)
    }

    // a hard cut (dip to black) or a large jump snaps; everything else is damped
    const cut = !k.ready || S.dip > 0.9 || k.pos.distanceToSquared(k.want) > 2.5 * 2.5
    if (cut) {
      k.pos.copy(k.want)
      k.look.copy(k.wantLook)
      k.fov.v = fov
      k.ready = true
    } else {
      easing.damp3(k.pos, k.want, 0.14, delta)
      easing.damp3(k.look, k.wantLook, 0.14, delta)
      easing.damp(k.fov, 'v', fov, 0.18, delta)
    }

    camera.position.copy(k.pos)
    camera.lookAt(k.look)
    if (c.roll) camera.rotateZ(c.roll)
    if (Math.abs(camera.fov - k.fov.v) > 0.001) {
      camera.fov = k.fov.v
      camera.updateProjectionMatrix()
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} intensity={0} />
      <directionalLight ref={sun} intensity={0} />
    </>
  )
}

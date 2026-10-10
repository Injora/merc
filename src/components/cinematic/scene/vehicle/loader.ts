import { useLoader, useThree } from '@react-three/fiber'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { WebGLRenderer } from 'three'
import { ASSETS } from '../../../../config/assets'

/**
 * GLTF loading with every compression path a delivered car model may use:
 * Draco or meshopt geometry, KTX2 (Basis) textures. Decoders/transcoders are
 * self-hosted in public/draco and public/basis — no CDN requests.
 */
let draco: DRACOLoader | null = null
let ktx2: KTX2Loader | null = null

function configure(loader: GLTFLoader, gl: WebGLRenderer) {
  draco ??= new DRACOLoader().setDecoderPath('/draco/')
  ktx2 ??= new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl)
  loader.setDRACOLoader(draco)
  loader.setKTX2Loader(ktx2)
  loader.setMeshoptDecoder(MeshoptDecoder)
}

export function useVehicleGLTF(url: string) {
  const gl = useThree((s) => s.gl)
  return useLoader(GLTFLoader, url, (loader) => configure(loader, gl))
}

/**
 * The car URL in use. In development, `?car=/models/x.glb` overrides the
 * config so the pipeline can be tested against fixtures without editing it.
 * `?nocar` (any build) makes it fail, so the fallback can be checked.
 */
export function getCarUrl(): string | null {
  // QA (any build): ?nocar simulates a model that fails to load, to verify the 2D fallback
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nocar')) return '/models/car/__unavailable__.glb'
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('car')
    if (override) return override
  }
  return ASSETS.models.car.url
}


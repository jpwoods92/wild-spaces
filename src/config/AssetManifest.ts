export interface SpriteAssetSpec {
  key: string;
  description: string;
  dimensions: string;
  frames: number;
  filePath: string;
  useExternalFile: boolean;
}

/**
 * Central manifest for Episode 1 (Polar Bear).
 * Currently `useExternalFile` is false so `BootScene` generates rich stylized
 * procedural top-down sprites automatically.
 *
 * When a real artist delivers a sprite or spritesheet, drop the PNG into
 * `public/assets/polar-bear/` and flip `useExternalFile: true`.
 */
export const POLAR_BEAR_ASSETS: SpriteAssetSpec[] = [
  {
    key: 'bear_walk',
    description: 'Top-down adult Polar Bear walking on ice (facing right / 0 rad)',
    dimensions: '64x44 px per frame',
    frames: 4,
    filePath: '/assets/polar-bear/bear_walk.png',
    useExternalFile: false,
  },
  {
    key: 'bear_swim',
    description: 'Top-down Polar Bear partially submerged swimming (head & shoulders above water)',
    dimensions: '64x44 px per frame',
    frames: 4,
    filePath: '/assets/polar-bear/bear_swim.png',
    useExternalFile: false,
  },
  {
    key: 'bear_lunge',
    description: 'Top-down Polar Bear pouncing forward with outstretched front paws',
    dimensions: '72x46 px single frame',
    frames: 1,
    filePath: '/assets/polar-bear/bear_lunge.png',
    useExternalFile: false,
  },
  {
    key: 'bear_cub',
    description: 'Top-down Polar Bear Cub waiting on the northern pack ice sanctuary',
    dimensions: '38x28 px per frame',
    frames: 2,
    filePath: '/assets/polar-bear/bear_cub.png',
    useExternalFile: false,
  },
  {
    key: 'seal_rest',
    description: 'Top-down Ringed Seal resting near ice edge (spotted grey-brown coat)',
    dimensions: '42x26 px per frame',
    frames: 2,
    filePath: '/assets/polar-bear/seal_rest.png',
    useExternalFile: false,
  },
  {
    key: 'ice_floe_variants',
    description: '3 organic jagged top-down sea-ice floe shapes with translucent cyan underwater shelf',
    dimensions: '256x256 px (scalable)',
    frames: 3,
    filePath: '/assets/polar-bear/ice_floes.png',
    useExternalFile: false,
  },
];

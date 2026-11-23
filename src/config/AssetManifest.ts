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

/**
 * Central manifest for Episode 2 (North Atlantic Right Whale — "Drowned Echoes").
 */
export const WHALE_ASSETS: SpriteAssetSpec[] = [
  {
    key: 'whale_swim',
    description: 'Top-down adult North Atlantic Right Whale with white head callosities & broad tail fluke (facing right / 0 rad)',
    dimensions: '112x64 px per frame',
    frames: 4,
    filePath: '/assets/whale/whale_swim.png',
    useExternalFile: false,
  },
  {
    key: 'whale_calf',
    description: 'Top-down Right Whale Calf waiting in the northern bay sanctuary',
    dimensions: '64x38 px per frame',
    frames: 2,
    filePath: '/assets/whale/whale_calf.png',
    useExternalFile: false,
  },
  {
    key: 'copepod_bloom',
    description: 'Glowing bioluminescent copepod / krill swarm for filter-feeding recovery',
    dimensions: '64x64 px per frame',
    frames: 2,
    filePath: '/assets/whale/copepod_bloom.png',
    useExternalFile: false,
  },
  {
    key: 'ghost_net',
    description: 'Drifting commercial lobster-pot buoy & ghost fishing net entanglement hazard',
    dimensions: '76x56 px single frame',
    frames: 1,
    filePath: '/assets/whale/ghost_net.png',
    useExternalFile: false,
  },
  {
    key: 'seismic_buoy',
    description: 'Offshore acoustic sonar / seismic survey buoy emitting high-decibel noise pulses',
    dimensions: '48x48 px single frame',
    frames: 1,
    filePath: '/assets/whale/seismic_buoy.png',
    useExternalFile: false,
  },
];

/**
 * Central manifest for Episode 3 (Ring-Tailed Lemur — "Fractured Canopy").
 */
export const LEMUR_ASSETS: SpriteAssetSpec[] = [
  {
    key: 'lemur_walk',
    description:
      'Top-down adult Ring-Tailed Lemur with grey-agouti back, dark eye mask, and iconic black-and-white banded tail (facing right / 0 rad)',
    dimensions: '68x44 px per frame',
    frames: 4,
    filePath: '/assets/lemur/lemur_walk.png',
    useExternalFile: false,
  },
  {
    key: 'lemur_leap',
    description:
      'Top-down Ring-Tailed Lemur mid-leap between tree crowns with outstretched limbs and streaming banded tail',
    dimensions: '76x48 px single frame',
    frames: 1,
    filePath: '/assets/lemur/lemur_leap.png',
    useExternalFile: false,
  },
  {
    key: 'lemur_troop',
    description:
      'Top-down Ring-Tailed Lemur juvenile waiting in the Ancient Baobab Sanctuary',
    dimensions: '44x32 px per frame',
    frames: 2,
    filePath: '/assets/lemur/lemur_troop.png',
    useExternalFile: false,
  },
  {
    key: 'tamarind_fruit',
    description:
      'Ripe Tamarind pods & wild fig cluster glowing inside the canopy crown',
    dimensions: '44x44 px per frame',
    frames: 2,
    filePath: '/assets/lemur/tamarind_fruit.png',
    useExternalFile: false,
  },
  {
    key: 'fossa_predator',
    description:
      'Top-down Fossa (Cryptoprocta ferox) ground ambush predator with reddish-brown coat and long tail',
    dimensions: '68x36 px per frame',
    frames: 4,
    filePath: '/assets/lemur/fossa_predator.png',
    useExternalFile: false,
  },
  {
    key: 'logging_truck',
    description:
      'Heavy industrial flatbed timber truck carrying felled hardwood logs along clear-cut haul roads',
    dimensions: '146x52 px single frame',
    frames: 1,
    filePath: '/assets/lemur/logging_truck.png',
    useExternalFile: false,
  },
];

/**
 * Central manifest for Episode 4 (Loggerhead Sea Turtle Hatchling — "False Horizon").
 */
export const TURTLE_ASSETS: SpriteAssetSpec[] = [
  {
    key: 'turtle_crawl',
    description:
      'Top-down Loggerhead Sea Turtle hatchling crawling across moonlit sand (facing right / 0 rad)',
    dimensions: '44x36 px per frame',
    frames: 4,
    filePath: '/assets/turtle/turtle_crawl.png',
    useExternalFile: false,
  },
  {
    key: 'turtle_burrow',
    description:
      'Hatchling tucked low and camouflaged inside a sand mound during burrow stealth',
    dimensions: '44x36 px single frame',
    frames: 1,
    filePath: '/assets/turtle/turtle_burrow.png',
    useExternalFile: false,
  },
  {
    key: 'ghost_crab',
    description:
      'Top-down pale nocturnal Ghost Crab predator patrolling the coastal beach',
    dimensions: '40x34 px per frame',
    frames: 4,
    filePath: '/assets/turtle/ghost_crab.png',
    useExternalFile: false,
  },
  {
    key: 'seabird_shadow',
    description:
      'Overhead gliding coastal gull / frigatebird silhouette sweeping over the shore',
    dimensions: '72x52 px per frame',
    frames: 2,
    filePath: '/assets/turtle/seabird_shadow.png',
    useExternalFile: false,
  },
  {
    key: 'plastic_debris',
    description:
      'Tangled beach plastic six-pack rings, bag sheet, and bottle cap snare hazard',
    dimensions: '58x46 px single frame',
    frames: 1,
    filePath: '/assets/turtle/plastic_debris.png',
    useExternalFile: false,
  },
  {
    key: 'wet_kelp',
    description:
      'Cool damp tide-pool seaweed patch for stamina and hydration recovery',
    dimensions: '52x52 px per frame',
    frames: 2,
    filePath: '/assets/turtle/wet_kelp.png',
    useExternalFile: false,
  },
  {
    key: 'driftwood_cover',
    description:
      'Weathered driftwood log casting protective dark shade from coastal glare and diving birds',
    dimensions: '92x42 px single frame',
    frames: 1,
    filePath: '/assets/turtle/driftwood_cover.png',
    useExternalFile: false,
  },
];

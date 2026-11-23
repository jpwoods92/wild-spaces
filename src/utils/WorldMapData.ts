import { clamp } from '../systems/EpisodeUIManager.ts';

export interface MapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LonLat = readonly [number, number];

export interface LandmassPolygon {
  name: string;
  points: readonly LonLat[];
}

export interface PopoverPosition {
  x: number;
  y: number;
  side: 'left' | 'right';
}

export const MAP_MIN_LON = -180;
export const MAP_MAX_LON = 180;
export const MAP_MIN_LAT = -60;
export const MAP_MAX_LAT = 82;
export const MAP_ASPECT_RATIO = 2.15;

/** Simplified world landmass polygons in `[longitude, latitude]` degrees. */
export const WORLD_LANDMASSES: readonly LandmassPolygon[] = [
  {
    name: 'North America',
    points: [
      [-168, 66],
      [-162, 70],
      [-156, 71.3],
      [-142, 70],
      [-130, 70.5],
      [-118, 69.5],
      [-102, 70],
      [-92, 68],
      [-94, 62],
      [-88, 55],
      [-79, 53],
      [-78, 62],
      [-65, 60],
      [-56, 53],
      [-53, 47],
      [-60, 46],
      [-65, 44],
      [-70, 42],
      [-75, 39],
      [-76, 35],
      [-81, 31],
      [-80.2, 25.5],
      [-82, 26],
      [-83, 29],
      [-88, 30],
      [-94, 29.5],
      [-97, 26],
      [-96, 19],
      [-90, 21.5],
      [-87, 21],
      [-88, 16],
      [-83, 14],
      [-80, 9],
      [-82, 8],
      [-87, 13],
      [-94, 15],
      [-105, 20],
      [-110, 24],
      [-114, 31],
      [-106, 23],
      [-112, 30],
      [-117, 32.5],
      [-122, 37],
      [-124, 42],
      [-124, 48.5],
      [-131, 54],
      [-140, 60],
      [-152, 60],
      [-163, 55],
      [-166, 61],
    ],
  },
  {
    name: 'Baffin Island',
    points: [
      [-78, 72],
      [-64, 67],
      [-66, 62],
      [-74, 64],
      [-82, 69],
    ],
  },
  {
    name: 'Greenland',
    points: [
      [-44, 60],
      [-52, 65],
      [-54, 72],
      [-70, 77],
      [-56, 81.5],
      [-32, 81.5],
      [-18, 77],
      [-22, 70],
      [-36, 65],
    ],
  },
  {
    name: 'South America',
    points: [
      [-78, 9],
      [-72, 12],
      [-62, 10.5],
      [-50, 1],
      [-35, -6],
      [-38, -14],
      [-41, -22],
      [-48, -26],
      [-54, -34],
      [-62, -41],
      [-67, -50],
      [-68, -55],
      [-74, -52],
      [-73, -42],
      [-71, -30],
      [-71, -18],
      [-81, -5],
      [-79, 2],
    ],
  },
  {
    name: 'Iceland',
    points: [
      [-24, 65],
      [-19, 66.5],
      [-14, 65],
      [-18, 63.5],
    ],
  },
  {
    name: 'British Isles',
    points: [
      [-9, 52],
      [-9, 55],
      [-5, 58.5],
      [-2, 57.5],
      [1.5, 52.5],
      [-5, 50],
    ],
  },
  {
    name: 'Europe',
    points: [
      [-9, 37],
      [-9, 43],
      [-2, 43.5],
      [-4, 48.5],
      [2, 51],
      [8, 54],
      [10, 57],
      [5, 61],
      [14, 68],
      [28, 71],
      [42, 68],
      [55, 68],
      [48, 46],
      [41, 42],
      [29, 41],
      [26, 40],
      [23, 37],
      [19, 40],
      [14, 45],
      [18, 40],
      [12, 38],
      [9, 44],
      [3, 43],
      [-1, 38],
      [-5.5, 36],
    ],
  },
  {
    name: 'Africa',
    points: [
      [-6, 36],
      [10, 37],
      [32, 31],
      [43, 12],
      [51, 12],
      [41, -2],
      [40, -11],
      [35, -24],
      [28, -33],
      [18.5, -34.5],
      [14, -22],
      [12, -12],
      [9, 4],
      [2, 6],
      [-8, 4.5],
      [-17, 15],
      [-16, 23],
      [-9, 32],
    ],
  },
  {
    name: 'Madagascar',
    points: [
      [49.5, -12],
      [50.3, -16],
      [47.5, -24.5],
      [44.5, -25.4],
      [43.4, -22],
      [44.5, -16.5],
    ],
  },
  {
    name: 'Asia',
    points: [
      [27, 38],
      [29, 41],
      [41, 42],
      [48, 46],
      [55, 68],
      [75, 73],
      [104, 77],
      [138, 72],
      [178, 66],
      [162, 60],
      [156, 51],
      [141, 53],
      [132, 43],
      [126, 35],
      [122, 31],
      [114, 22],
      [108, 16],
      [105, 9],
      [100, 13],
      [104, 1.5],
      [98, 8],
      [91, 22],
      [80, 13],
      [77.5, 8],
      [72, 20],
      [67, 25],
      [56, 26],
      [59, 22],
      [45, 13],
      [35, 29],
      [36, 36],
    ],
  },
  {
    name: 'Japan',
    points: [
      [130, 32],
      [136, 35],
      [141, 38],
      [145, 44],
      [140, 42],
      [135, 36],
    ],
  },
  {
    name: 'Sumatra',
    points: [
      [95, 5],
      [99, 2],
      [106, -6],
      [103, -6],
      [97, 1],
    ],
  },
  {
    name: 'Borneo',
    points: [
      [109, 1],
      [117, 6],
      [118, 2],
      [116, -3],
      [110, -3],
    ],
  },
  {
    name: 'New Guinea',
    points: [
      [132, -2],
      [141, -3],
      [150, -10],
      [143, -9],
      [134, -5],
    ],
  },
  {
    name: 'Australia',
    points: [
      [114, -22],
      [122, -17],
      [130, -12],
      [136, -12],
      [136, -15],
      [142, -11],
      [146, -18],
      [153, -27],
      [150, -37],
      [140, -38],
      [135, -34],
      [128, -32],
      [115, -34],
    ],
  },
  {
    name: 'New Zealand',
    points: [
      [172, -35],
      [178, -38],
      [172, -43],
      [167, -46],
      [168, -42],
      [173, -38],
    ],
  },
];

/**
 * Computes centered world map rectangle inside the viewport respecting header,
 * bottom legend/margin, and side padding while maintaining a 2.15:1 aspect ratio.
 */
export function computeMapBounds(
  viewportW: number,
  viewportH: number,
  topReserved = 128,
  bottomMargin = 44,
  sideMargin = 32
): MapBounds {
  const availW = Math.max(240, viewportW - sideMargin * 2);
  const availH = Math.max(120, viewportH - topReserved - bottomMargin);

  let width = availW;
  let height = width / MAP_ASPECT_RATIO;
  if (height > availH) {
    height = availH;
    width = height * MAP_ASPECT_RATIO;
  }

  return {
    x: (viewportW - width) / 2,
    y: topReserved + (availH - height) / 2,
    width,
    height,
  };
}

/** Projects geographic `[lon, lat]` coordinates onto pixel `(x, y)` inside `bounds`. */
export function projectLonLat(
  lon: number,
  lat: number,
  bounds: MapBounds
): { x: number; y: number } {
  const clampedLon = clamp(lon, MAP_MIN_LON, MAP_MAX_LON);
  const clampedLat = clamp(lat, MAP_MIN_LAT, MAP_MAX_LAT);

  const tx = (clampedLon - MAP_MIN_LON) / (MAP_MAX_LON - MAP_MIN_LON);
  const ty = (MAP_MAX_LAT - clampedLat) / (MAP_MAX_LAT - MAP_MIN_LAT);

  return {
    x: bounds.x + tx * bounds.width,
    y: bounds.y + ty * bounds.height,
  };
}

/**
 * Places a hover popover card beside `(pinX, pinY)`, preferring the right side
 * and flipping left or clamping so the entire card always stays inside the viewport.
 */
export function computeCardPopoverPosition(
  pinX: number,
  pinY: number,
  cardW: number,
  cardH: number,
  viewportW: number,
  viewportH: number,
  topMargin = 104,
  edgeMargin = 18,
  pinOffset = 28
): PopoverPosition {
  const rightX = pinX + pinOffset;
  const leftX = pinX - pinOffset - cardW;
  const rightFits = rightX + cardW <= viewportW - edgeMargin;
  const leftFits = leftX >= edgeMargin;

  let side: 'left' | 'right';
  let rawX: number;
  if (rightFits) {
    side = 'right';
    rawX = rightX;
  } else if (leftFits) {
    side = 'left';
    rawX = leftX;
  } else {
    // Pick whichever side has more room on tight viewports
    const rightSpace = viewportW - edgeMargin - pinX;
    const leftSpace = pinX - edgeMargin;
    if (rightSpace >= leftSpace) {
      side = 'right';
      rawX = rightX;
    } else {
      side = 'left';
      rawX = leftX;
    }
  }

  const maxX = Math.max(edgeMargin, viewportW - cardW - edgeMargin);
  const maxY = Math.max(topMargin, viewportH - cardH - edgeMargin);

  return {
    x: clamp(rawX, edgeMargin, maxX),
    y: clamp(pinY - cardH * 0.45, topMargin, maxY),
    side,
  };
}

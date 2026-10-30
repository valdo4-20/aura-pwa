export const SHAPES = [
  'sphere',
  'cube',
  'pyramid',
  'cylinder',
  'torus',
  'cup',
  'tree',
  'planet',
  'solar-system',
  'atom',
  'network',
] as const;

export type ShapeName = (typeof SHAPES)[number];
export type Point3 = readonly [number, number, number];

const TAU = Math.PI * 2;

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function spherePoint(index: number, count: number, radius = 1): Point3 {
  const y = 1 - ((index + 0.5) / count) * 2;
  const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(angle) * ringRadius * radius, y * radius, Math.sin(angle) * ringRadius * radius];
}

function trianglePoint(random: () => number, a: Point3, b: Point3, c: Point3): Point3 {
  let u = random();
  let v = random();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  return [
    a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]),
    a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]),
    a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]),
  ];
}

function createShapePoint(shape: ShapeName, index: number, count: number, random: () => number): Point3 {
  if (shape === 'sphere') return spherePoint(index, count);

  if (shape === 'cube') {
    const u = random() * 2 - 1;
    const v = random() * 2 - 1;
    switch (index % 6) {
      case 0: return [1, u, v];
      case 1: return [-1, u, v];
      case 2: return [u, 1, v];
      case 3: return [u, -1, v];
      case 4: return [u, v, 1];
      default: return [u, v, -1];
    }
  }

  if (shape === 'pyramid') {
    const corners: Point3[] = [[-1, -0.8, -1], [1, -0.8, -1], [1, -0.8, 1], [-1, -0.8, 1]];
    const face = index % 5;
    if (face === 4) return trianglePoint(random, corners[0], corners[1], corners[2]);
    return trianglePoint(random, corners[face], corners[(face + 1) % 4], [0, 1, 0]);
  }

  if (shape === 'cylinder') {
    const angle = random() * TAU;
    const radius = 0.82;
    if (index % 3 === 0) return [Math.cos(angle) * radius, random() * 2 - 1, Math.sin(angle) * radius];
    const y = index % 2 === 0 ? 1 : -1;
    const r = Math.sqrt(random()) * radius;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r];
  }

  if (shape === 'torus') {
    const u = random() * TAU;
    const v = random() * TAU;
    const major = 0.68;
    const minor = 0.32;
    return [(major + minor * Math.cos(v)) * Math.cos(u), minor * Math.sin(v), (major + minor * Math.cos(v)) * Math.sin(u)];
  }

  if (shape === 'cup') {
    const angle = random() * TAU;
    const section = index % 5;
    if (section < 3) {
      const y = -0.78 + random() * 1.55;
      const radius = 0.56 + ((y + 0.78) / 1.55) * 0.22;
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    }
    if (section === 3) return [Math.cos(angle) * (0.25 + 0.52 * random()), -0.78, Math.sin(angle) * (0.25 + 0.52 * random())];
    const t = random() * Math.PI;
    return [0.72 + 0.32 * Math.sin(t), 0.05 + 0.58 * Math.cos(t), 0];
  }

  if (shape === 'tree') {
    if (index % 6 === 0) {
      const angle = random() * TAU;
      const y = -0.9 + random() * 0.7;
      return [Math.cos(angle) * 0.16, y, Math.sin(angle) * 0.16];
    }
    const layer = Math.floor(random() * 3);
    const yBottom = 0.95 - layer * 0.58;
    const height = 0.76;
    const y = yBottom - random() * height;
    const radius = ((yBottom - y) / height) * (0.83 - layer * 0.12);
    const angle = random() * TAU;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  }

  if (shape === 'planet') {
    if (index % 4 === 0) {
      const angle = random() * TAU;
      const radius = 0.86 + random() * 0.27;
      return [Math.cos(angle) * radius, (random() - 0.5) * 0.045, Math.sin(angle) * radius];
    }
    return spherePoint(index, count, 0.68);
  }

  if (shape === 'solar-system') {
    const section = index % 5;
    if (section === 0) return spherePoint(index, count, 0.24);
    if (section === 1 || section === 2) {
      const radius = section === 1 ? 0.56 : 0.94;
      const angle = random() * TAU;
      return [Math.cos(angle) * radius, (random() - 0.5) * 0.025, Math.sin(angle) * radius];
    }
    const angle = random() * TAU;
    const orbit = index % 2 === 0 ? 0.56 : 0.94;
    const point = spherePoint(index, count, index % 2 === 0 ? 0.09 : 0.14);
    return [Math.cos(angle) * orbit + point[0], point[1], Math.sin(angle) * orbit + point[2]];
  }

  if (shape === 'atom') {
    if (index % 4 === 0) return spherePoint(index, count, 0.22);
    const orbit = index % 3;
    const angle = random() * TAU;
    const radius = 0.8;
    if (orbit === 0) return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
    const tilt = orbit === 1 ? Math.PI / 3 : -Math.PI / 3;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius * Math.cos(tilt), Math.sin(angle) * radius * Math.sin(tilt)];
  }

  const angle = (index / count) * TAU * 5;
  const y = Math.sin(angle * 0.4) * 0.76;
  const radius = 0.72 + 0.18 * Math.cos(angle * 0.7);
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

export function generateGeometry(shape: ShapeName, count: number): Float32Array {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('A quantidade de pontos deve ser um inteiro positivo.');
  const positions = new Float32Array(count * 3);
  const random = randomGenerator(0xa011a + shape.length * 97 + count);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = createShapePoint(shape, index, count, random);
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
  }
  return positions;
}

export function isShapeName(value: string): value is ShapeName {
  return (SHAPES as readonly string[]).includes(value);
}

export function shapeLabel(shape: ShapeName): string {
  const labels: Record<ShapeName, string> = {
    sphere: 'ESFERA',
    cube: 'CUBO',
    pyramid: 'PIRÂMIDE',
    cylinder: 'CILINDRO',
    torus: 'TORO',
    cup: 'XÍCARA',
    tree: 'ÁRVORE',
    planet: 'PLANETA',
    'solar-system': 'SISTEMA SOLAR',
    atom: 'ÁTOMO',
    network: 'REDE',
  };
  return labels[shape];
}

import { describe, expect, it } from 'vitest';
import { generateGeometry, SHAPES } from '../src/geometry';

describe('geometria procedural', () => {
  it('gera posições XYZ finitas e com a quantidade solicitada para cada forma', () => {
    for (const shape of SHAPES) {
      const points = generateGeometry(shape, 180);
      expect(points).toHaveLength(540);
      expect([...points].every(Number.isFinite)).toBe(true);
    }
  });

  it('gera a mesma forma de maneira determinística e aceita densidades diferentes', () => {
    expect(generateGeometry('sphere', 64)).toEqual(generateGeometry('sphere', 64));
    expect(generateGeometry('sphere', 65)).toHaveLength(195);
  });

  it('rejeita quantidade de pontos inválida', () => {
    expect(() => generateGeometry('cube', 0)).toThrow(RangeError);
  });
});

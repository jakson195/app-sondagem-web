declare module "d3-contour" {
  export interface ContourMultiPolygon {
    type: "MultiPolygon";
    value: number;
    coordinates: number[][][][];
  }

  export interface ContoursGenerator {
    size(size: [number, number]): this;
    thresholds(thresholds: number[]): this;
    (values: ArrayLike<number>): ContourMultiPolygon[];
  }

  export function contours(): ContoursGenerator;
}

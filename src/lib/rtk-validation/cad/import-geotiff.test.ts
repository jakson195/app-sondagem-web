import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCadGeorefContext } from "./georef";
import { enToLatLon, latLonToEn } from "@/lib/rtk-validation/project-coords";
import {
  findWorldFileCompanion,
  isGeotiffOrEcwName,
  isRasterImportName,
  isWorldFileName,
  parseWorldFileText,
  pickRasterImportFiles,
  rasterBoundsToProjectCoords,
  utmZoneFromProjectedEpsg,
  worldFileCandidates,
  worldFileToBbox,
} from "./import-geotiff";

const georef23 = createCadGeorefContext(23);

describe("import georreferenciado TIFF/ECW", () => {
  it("reconhece extensões GeoTIFF, ECW e world file", () => {
    assert.equal(isGeotiffOrEcwName("orto.tif"), true);
    assert.equal(isGeotiffOrEcwName("orto.TIFF"), true);
    assert.equal(isGeotiffOrEcwName("orto.ecw"), true);
    assert.equal(isGeotiffOrEcwName("desenho.dxf"), false);
    assert.equal(isRasterImportName("foto.jpg"), true);
    assert.equal(isWorldFileName("orto.tfw"), true);
    assert.equal(isWorldFileName("orto.wld"), true);
    assert.deepEqual(worldFileCandidates("quadra.tif"), [
      "quadra.tfw",
      "quadra.tifw",
      "quadra.tiffw",
      "quadra.wld",
    ]);
  });

  it("associa o world file ao TIFF selecionado", () => {
    const tiff = new File([""], "orto.tif");
    const tfw = new File(["1"], "orto.tfw");
    const extra = new File([""], "outro.tfw");
    assert.equal(findWorldFileCompanion([tiff, extra, tfw], tiff), tfw);
    const picked = pickRasterImportFiles([tfw, tiff]);
    assert.equal(picked?.raster.name, "orto.tif");
    assert.equal(picked?.worldFile?.name, "orto.tfw");
  });

  it("lê world file e calcula a extensão em metros", () => {
    const wf = parseWorldFileText("0.10\n0.0\n0.0\n-0.10\n500000.05\n7400000.05\n");
    assert.equal(wf.A, 0.1);
    assert.equal(wf.E, -0.1);
    const bbox = worldFileToBbox(wf, 100, 50);
    assert.ok(Math.abs(bbox[0] - 500000) < 1e-6);
    assert.ok(Math.abs(bbox[2] - 500010) < 1e-6);
    assert.ok(Math.abs(bbox[1] - 7_399_995.1) < 1e-6);
    assert.ok(Math.abs(bbox[3] - 7_400_000.1) < 1e-6);
  });

  it("identifica fuso SIRGAS/WGS84 UTM pelo EPSG", () => {
    assert.equal(utmZoneFromProjectedEpsg(31983), 23);
    assert.equal(utmZoneFromProjectedEpsg(31982), 22);
    assert.equal(utmZoneFromProjectedEpsg(32723), 23);
    assert.equal(utmZoneFromProjectedEpsg(4326), null);
  });

  it("mantém GeoTIFF já em SIRGAS UTM do fuso do projeto", () => {
    const bounds = rasterBoundsToProjectCoords([333000, 7_390_000, 334000, 7_391_000], 31983, georef23);
    assert.deepEqual(bounds, {
      minX: 333000,
      minY: 7_390_000,
      maxX: 334000,
      maxY: 7_391_000,
    });
  });

  it("converte GeoTIFF em graus (WGS84/SIRGAS) para UTM do projeto", () => {
    const west = -46.64;
    const east = -46.63;
    const south = -23.56;
    const north = -23.55;
    const bounds = rasterBoundsToProjectCoords([west, south, east, north], 4326, georef23);
    const corners = [
      latLonToEn(south, west, 23),
      latLonToEn(south, east, 23),
      latLonToEn(north, east, 23),
      latLonToEn(north, west, 23),
    ];
    assert.ok(Math.abs(bounds.minX - Math.min(...corners.map((c) => c.e))) < 1e-6);
    assert.ok(Math.abs(bounds.minY - Math.min(...corners.map((c) => c.n))) < 1e-6);
    assert.ok(Math.abs(bounds.maxX - Math.max(...corners.map((c) => c.e))) < 1e-6);
    assert.ok(Math.abs(bounds.maxY - Math.max(...corners.map((c) => c.n))) < 1e-6);
    assert.ok(bounds.minX > 300_000 && bounds.maxX < 400_000);
    assert.ok(bounds.minY > 7_300_000 && bounds.maxY < 7_500_000);
  });

  it("reprojeta UTM de outro fuso para o fuso do CAD", () => {
    const e = 700_000;
    const n = 7_400_000;
    const { lat, lon } = enToLatLon(e, n, 22);
    const expected = latLonToEn(lat, lon, 23);
    const bounds = rasterBoundsToProjectCoords([e, n, e + 10, n + 10], 31982, georef23);
    assert.ok(Math.abs(bounds.minX - expected.e) < 1.5);
    assert.ok(Math.abs(bounds.minY - expected.n) < 1.5);
  });
});

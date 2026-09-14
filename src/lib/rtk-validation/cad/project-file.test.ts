import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAD_PROJECT_FILE_KIND,
  CAD_PROJECT_FILE_VERSION,
  buildCloudSaveBody,
  cadProjectFileBasename,
  cloudPayloadHasRasterBytes,
  parseCadProjectFile,
  parseCadProjectFileText,
  prepareCloudCadPayload,
  sanitizeCloudCadWriteData,
  serializeCadProjectFile,
  snapshotFromSavedRecord,
  splitStoredCadData,
  toCloudCadProject,
} from "./project-file";
import type { CadProject, CadRasterOverlay } from "./types";

function sampleProject(): CadProject {
  return {
    name: "Gleba Norte",
    crs: "EPSG:31982",
    layers: [
      {
        id: "draw",
        name: "DESENHO",
        color: "#fbbf24",
        visible: true,
        locked: false,
        hatchPattern: "diagonal",
        lineType: "solid",
      },
      {
        id: "loteamento_lotes",
        name: "LOTES",
        color: "#d97706",
        visible: true,
        locked: false,
        fillColor: "#f59e0b",
      },
      {
        id: "loteamento_eixo",
        name: "EIXO",
        color: "#64748b",
        visible: true,
        locked: false,
        lineType: "dashed",
      },
    ],
    entities: [
      {
        id: "pt_1",
        type: "point",
        layerId: "draw",
        x: 500000.12,
        y: 7100000.45,
        z: 12.3,
        label: "M-01",
      },
      {
        id: "pl_1",
        type: "polyline",
        layerId: "loteamento_lotes",
        closed: true,
        name: "Q A — 01",
        confrontations: ["Rua A", "Lote 02", "Fundo", "Via"],
        vertices: [
          { x: 500000, y: 7100000, z: 10 },
          { x: 500020, y: 7100000, z: 10 },
          { x: 500020, y: 7100015, z: 10.2 },
          { x: 500000, y: 7100015, z: 10.1 },
        ],
      },
    ],
    adjustment: {
      method: "helmert",
      rmsBefore: 0.08,
      rmsAfter: 0.012,
      importedAt: "2026-08-26T12:00:00.000Z",
    },
  };
}

function sampleRaster(): CadRasterOverlay {
  return {
    id: "ortho_1",
    name: "Ortofoto REURB",
    kind: "orthophoto",
    imageDataUrl: "data:image/png;base64,aaa",
    minX: 500000,
    minY: 7100000,
    maxX: 500100,
    maxY: 7100100,
    opacity: 0.85,
    visible: true,
  };
}

describe("serializeCadProjectFile / parseCadProjectFile", () => {
  it("round-trip restores name, CRS, layers, geometry, hatch and rasters", () => {
    const project = sampleProject();
    const rasters = [sampleRaster()];
    const json = serializeCadProjectFile({ project, rasters }, "2026-08-26T15:00:00.000Z");
    const parsed = parseCadProjectFileText(json);

    assert.equal(parsed.project.name, "Gleba Norte");
    assert.equal(parsed.project.crs, "EPSG:31982");
    assert.equal(parsed.project.layers.length, 3);
    assert.equal(parsed.project.layers[0]?.hatchPattern, "diagonal");
    assert.equal(parsed.project.layers[2]?.lineType, "dashed");
    assert.equal(parsed.project.entities.length, 2);

    const lot = parsed.project.entities.find((e) => e.id === "pl_1");
    assert.ok(lot && lot.type === "polyline");
    assert.equal(lot.closed, true);
    assert.equal(lot.vertices.length, 4);
    assert.deepEqual(lot.confrontations, ["Rua A", "Lote 02", "Fundo", "Via"]);
    assert.equal(lot.vertices[2]?.z, 10.2);

    assert.equal(parsed.rasters.length, 1);
    assert.equal(parsed.rasters[0]?.kind, "orthophoto");
    assert.equal(parsed.rasters[0]?.imageDataUrl, "data:image/png;base64,aaa");
    assert.equal(parsed.project.adjustment?.method, "helmert");

    const file = JSON.parse(json) as { kind: string; version: number };
    assert.equal(file.kind, CAD_PROJECT_FILE_KIND);
    assert.equal(file.version, CAD_PROJECT_FILE_VERSION);
  });

  it("accepts a bare CadProject JSON previously stored in the API", () => {
    const snap = parseCadProjectFile(sampleProject());
    assert.equal(snap.project.entities.length, 2);
    assert.equal(snap.project.crs, "EPSG:31982");
    assert.equal(snap.rasters.length, 0);
  });

  it("accepts an API record wrapper { project, rasters }", () => {
    const snap = parseCadProjectFile({
      id: "abc",
      name: "Gleba Norte",
      project: sampleProject(),
      rasters: [sampleRaster()],
    });
    assert.equal(snap.project.entities.length, 2);
    assert.equal(snap.rasters[0]?.id, "ortho_1");
  });

  it("rejects garbage that is not a CAD project", () => {
    assert.throws(() => parseCadProjectFile({ foo: 1 }), /inválido|não suportada/);
    assert.throws(() => parseCadProjectFileText("not json"), /JSON/);
  });
});

describe("cadProjectFileBasename", () => {
  it("builds a safe .cad.json filename", () => {
    assert.equal(cadProjectFileBasename("Gleba Norte / 01"), "Gleba_Norte_01.cad.json");
  });
});

describe("splitStoredCadData / snapshotFromSavedRecord", () => {
  it("pulls rasters off stored project JSON without dropping loteamento layers", () => {
    const stored = { ...sampleProject(), rasters: [sampleRaster()] };
    const snap = splitStoredCadData(stored, "X");
    assert.equal(snap.project.layers.some((l) => l.id === "loteamento_lotes"), true);
    assert.equal(snap.rasters.length, 1);
    assert.equal("rasters" in snap.project, false);
  });

  it("prefers rasters on the saved record over nested copies", () => {
    const snap = snapshotFromSavedRecord({
      name: "Gleba Norte",
      project: sampleProject(),
      rasters: [sampleRaster()],
    });
    assert.equal(snap.rasters[0]?.name, "Ortofoto REURB");
  });
});

describe("local serialize vs cloud payload", () => {
  it("local .cad.json keeps raster bytes for offline reopen", () => {
    const json = serializeCadProjectFile({ project: sampleProject(), rasters: [sampleRaster()] });
    assert.match(json, /data:image\/png;base64,aaa/);
    const parsed = parseCadProjectFileText(json);
    assert.equal(parsed.rasters[0]?.imageDataUrl, "data:image/png;base64,aaa");
  });

  it("cloud payload never includes TIFF/JPEG/PNG bytes", () => {
    const prepared = prepareCloudCadPayload(sampleProject(), [sampleRaster()]);
    assert.equal(prepared.rastersOmitted, true);
    assert.equal("rasters" in prepared.stored, false);
    assert.equal(cloudPayloadHasRasterBytes(prepared.stored), false);
    assert.equal(JSON.stringify(prepared.stored).includes("data:image"), false);

    const jpeg: CadRasterOverlay = {
      ...sampleRaster(),
      id: "ortho_jpg",
      imageDataUrl: "data:image/jpeg;base64,/9j/aaaa",
    };
    const tiff: CadRasterOverlay = {
      ...sampleRaster(),
      id: "ortho_tif",
      imageDataUrl: "data:image/tiff;base64,SUkq",
    };
    const body = buildCloudSaveBody("Gleba Norte", sampleProject(), "AAAA", "Gleba_Norte.dwg");
    assert.equal(cloudPayloadHasRasterBytes(body.project), false);
    assert.equal(cloudPayloadHasRasterBytes(body), false);
    assert.equal(cloudPayloadHasRasterBytes({ project: toCloudCadProject(sampleProject()), rasters: [jpeg, tiff] }), true);
    const sanitized = sanitizeCloudCadWriteData(
      { ...sampleProject(), rasters: [jpeg, tiff] },
      "Gleba Norte",
    );
    assert.equal(cloudPayloadHasRasterBytes(sanitized), false);
    assert.equal(sanitized.entities.length, 2);
    assert.equal(body.dwgBase64, "AAAA");
    assert.equal(body.dwgFilename.endsWith(".dwg"), true);
  });
});

"use client";

import { Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import {
  MAQUETE_GLEBA_CLIP,
  MAQUETE_GRASS_MATERIAL,
  MAQUETE_GRASS_TILE_M,
  MAQUETE_GRASS_TEXTURE_SIZE,
  buildLoteamentoMaquete,
  createMaqueteGrassRoughnessData,
  createMaqueteGrassTextureData,
  type LoteamentoMaqueteScene,
  type MaqueteCar,
  type MaqueteCurb,
  type MaqueteHouse,
  type MaquetePerson,
  type MaquetePoly,
  type MaqueteRing,
  type MaqueteTree,
} from "@/lib/rtk-validation/cad/loteamento-maquete";
import type { SecaoTipoParams } from "@/lib/rtk-validation/cad/street-profile";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

const HOUSE_WALL_PITCHED = ["#f4f0e8", "#f7f3ec", "#efeae1", "#f6f1e9", "#f2eee6"];
const HOUSE_ROOF_PITCHED = ["#e07028", "#d46220", "#e87c30", "#c8581c"];
const HOUSE_WALL_MODERN = ["#8d9094", "#7a7e83", "#9a9da1", "#6e7277", "#84888c"];
const HOUSE_ROOF_MODERN = ["#5c6064", "#4a4e52", "#686c70", "#55595d"];
const PERSON_CLOTH = ["#3d4a5c", "#5c5346", "#6b4a3a", "#4a5560", "#3f4f3a", "#5a4a4a"];
const PERSON_HEAD = ["#3b2a22", "#2c241c", "#4a3728", "#1f1a16"];
const CAR_BODY = ["#d8d4cf", "#8a8f94", "#2c3036", "#3d4a62", "#6b3a38", "#c4b8a8"];

export type MaqueteVisual = "humanizado" | "realista";

/**
 * Cores por estilo. "humanizado" = maquete clara de vendas (mesma paleta da imagem e do KMZ
 * do Google Earth): tons suaves, fundo claro, lotes creme, árvores oliva, telhados terracota.
 */
const VISUAL = {
  realista: {
    fundo: "#000000",
    chao: "#000000",
    base: null as string | null,
    asfalto: "#61656a",
    calcada: "#e8e6e1",
    meioFio: "#f2f0eb",
    lote: null as string | null,
    loteLinha: "#f4f6f3",
    reserva: "#1d5a28",
    util: "#1d5a28",
    eixo: "#f0d056",
    canteiro: "#2f8c34",
    copaLarga: "#143f1c",
    copaConifera: "#0f3316",
    copaPalmeira: "#1f7a32",
    copaCalcada: "#2f6e3a",
    tronco: "#5c4033",
    paredes: HOUSE_WALL_PITCHED,
    telhados: HOUSE_ROOF_PITCHED,
    paredesModernas: HOUSE_WALL_MODERN,
    telhadosModernos: HOUSE_ROOF_MODERN,
    rotulo: "#f4efd8",
    rotuloContorno: "#1f2937",
    ceu: "#d5e4c8",
    luzChao: "#1a1a1a",
    hemisferio: 0.62,
    ambiente: 0.52,
    sol: 1.12,
    exposicao: 1.18,
  },
  humanizado: {
    fundo: "#eef0ee",
    chao: "#eef0ee",
    base: "#e4e2bf",
    asfalto: "#7d8085",
    calcada: "#d6d4c2",
    meioFio: "#ecebe3",
    lote: "#ecebc4",
    loteLinha: "#fbfaee",
    reserva: "#cdd99c",
    util: "#e6e0c4",
    eixo: "#f2f2ee",
    canteiro: "#cdd99c",
    copaLarga: "#8a9a4a",
    copaConifera: "#76863f",
    copaPalmeira: "#93a04f",
    copaCalcada: "#93a04f",
    tronco: "#7a5f46",
    paredes: ["#f4efe2", "#efe8d6", "#ece7df", "#f6f2ea", "#f1ebdd"],
    telhados: ["#c27450", "#b3633f", "#8d6a55", "#a8826a"],
    paredesModernas: ["#f1ede4", "#e9e4da", "#ece8df", "#f4f1ea"],
    telhadosModernos: ["#5f6368", "#6c7075", "#8d6a55", "#7b7f84"],
    rotulo: "#5f6368",
    rotuloContorno: "#f4f3e8",
    ceu: "#ffffff",
    luzChao: "#d9d6c0",
    hemisferio: 0.85,
    ambiente: 0.45,
    sol: 0.95,
    exposicao: 1.02,
  },
} as const;
type Paleta = (typeof VISUAL)[MaqueteVisual];

type Props = {
  project: CadProject;
  secaoTipo: SecaoTipoParams;
  sidewalkFallbackM: number;
  georef: CadGeorefContext;
  onClose: () => void;
};

function toLocal(ring: MaqueteRing, ox: number, oy: number): [number, number][] {
  return ring.map((p) => [p[0]! - ox, p[1]! - oy]);
}

function addContour(shape: THREE.Shape | THREE.Path, pts: [number, number][]) {
  shape.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]![0], pts[i]![1]);
  shape.closePath();
}

function applyPlanarMeterUVs(geom: THREE.BufferGeometry, metersPerTile: number) {
  const pos = geom.getAttribute("position");
  if (!pos) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / metersPerTile;
    uv[i * 2 + 1] = pos.getZ(i) / metersPerTile;
  }
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

function useMaqueteGrassMaterial() {
  const material = useMemo(() => {
    const size = MAQUETE_GRASS_TEXTURE_SIZE;
    const map = new THREE.DataTexture(createMaqueteGrassTextureData(size), size, size, THREE.RGBAFormat);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;

    const roughnessMap = new THREE.DataTexture(
      createMaqueteGrassRoughnessData(size),
      size,
      size,
      THREE.RGBAFormat,
    );
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.colorSpace = THREE.NoColorSpace;
    roughnessMap.generateMipmaps = true;
    roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    roughnessMap.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
      color: "#6fbf32",
      map,
      roughnessMap,
      roughness: 0.92,
      metalness: 0,
      bumpMap: map,
      bumpScale: 0.28,
      emissive: "#1f6b14",
      emissiveIntensity: 0.18,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vMaqueteWorld;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vMaqueteWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vMaqueteWorld;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           float gx = vMaqueteWorld.x;
           float gz = vMaqueteWorld.z;
           float patch = 0.62 + 0.38 * sin(gx * 0.33) * sin(gz * 0.27);
           float patch2 = 0.72 + 0.28 * sin(gx * 0.11 + 1.4) * cos(gz * 0.13);
           float blade = smoothstep(0.28, 0.92, fract(gx * 4.6 + sin(gz * 9.5) * 0.2));
           float tuft = smoothstep(0.2, 0.8, fract(gz * 6.8 + sin(gx * 7.2) * 0.14));
           vec3 darkLawn = vec3(0.14, 0.40, 0.08);
           vec3 midLawn = vec3(0.27, 0.62, 0.12);
           vec3 lightLawn = vec3(0.58, 0.88, 0.20);
           vec3 lawn = mix(darkLawn, lightLawn, blade * (0.55 + 0.45 * tuft));
           lawn = mix(lawn, midLawn, 0.18) * patch * patch2;
           diffuseColor.rgb = mix(lawn, diffuseColor.rgb * vec3(0.45, 1.25, 0.38), 0.22);`,
        );
    };
    return mat;
  }, []);

  useEffect(() => {
    return () => {
      material.map?.dispose();
      material.roughnessMap?.dispose();
      material.dispose();
    };
  }, [material]);

  return material;
}

function GrassLots({
  polys,
  origin,
}: {
  polys: MaquetePoly[];
  origin: { x: number; y: number };
}) {
  const material = useMaqueteGrassMaterial();
  const geoms = useMemo(() => {
    return polys
      .map((poly) => {
        const g = extrudePoly(poly, origin.x, origin.y, 0.012, 0.07);
        if (!g) return null;
        applyPlanarMeterUVs(g, MAQUETE_GRASS_TILE_M);
        return g;
      })
      .filter((g): g is THREE.ExtrudeGeometry => g != null);
  }, [polys, origin.x, origin.y]);

  useEffect(() => {
    return () => {
      for (const g of geoms) g.dispose();
    };
  }, [geoms]);

  if (!MAQUETE_GRASS_MATERIAL || geoms.length === 0) return null;
  return (
    <>
      {geoms.map((geom, i) => (
        <mesh key={i} geometry={geom} material={material} castShadow receiveShadow />
      ))}
    </>
  );
}

function extrudePoly(poly: MaquetePoly, ox: number, oy: number, y0: number, height: number): THREE.ExtrudeGeometry | null {
  const outer = toLocal(poly.outer, ox, oy);
  if (outer.length < 3) return null;
  const shape = new THREE.Shape();
  addContour(shape, outer);
  for (const hole of poly.holes) {
    const h = toLocal(hole, ox, oy);
    if (h.length < 3) continue;
    const path = new THREE.Path();
    addContour(path, h);
    shape.holes.push(path);
  }
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y0, 0);
  return geom;
}

function ExtrudedAreas({
  polys,
  origin,
  y0,
  height,
  color,
  roughness = 0.88,
}: {
  polys: MaquetePoly[];
  origin: { x: number; y: number };
  y0: number;
  height: number;
  color: string | string[];
  roughness?: number;
}) {
  const geoms = useMemo(() => {
    return polys
      .map((poly) => extrudePoly(poly, origin.x, origin.y, y0, height))
      .filter((g): g is THREE.ExtrudeGeometry => g != null);
  }, [polys, origin.x, origin.y, y0, height]);

  useEffect(() => {
    return () => {
      for (const g of geoms) g.dispose();
    };
  }, [geoms]);

  return (
    <>
      {geoms.map((geom, i) => (
        <mesh key={i} geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial
            color={Array.isArray(color) ? color[i % color.length] : color}
            roughness={roughness}
            metalness={0.02}
          />
        </mesh>
      ))}
    </>
  );
}

function InstancedBoxes({
  items,
  origin,
  color,
  roughness = 0.72,
  yOffset = 0,
}: {
  items: { x: number; y: number; length: number; width: number; height: number; rotation: number }[];
  origin: { x: number; y: number };
  color: string;
  roughness?: number;
  yOffset?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = items.length;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const it = items[i]!;
      dummy.position.set(it.x - origin.x, it.height / 2 + yOffset, -(it.y - origin.y));
      dummy.rotation.set(0, -it.rotation, 0);
      dummy.scale.set(it.length, it.height, it.width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
  }, [items, origin.x, origin.y, count, yOffset]);

  if (count === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={0.04} />
    </instancedMesh>
  );
}

function InstancedHouses({
  houses,
  origin,
  paleta,
}: {
  houses: MaqueteHouse[];
  origin: { x: number; y: number };
  paleta: Paleta;
}) {
  const pitched = useMemo(() => houses.filter((h) => h.style === "pitched"), [houses]);
  const modern = useMemo(() => houses.filter((h) => h.style === "modern"), [houses]);
  return (
    <>
      <InstancedPitchedHouses houses={pitched} origin={origin} wallColors={paleta.paredes} roofColors={paleta.telhados} />
      <InstancedModernHouses
        houses={modern}
        origin={origin}
        wallColors={paleta.paredesModernas}
        roofColors={paleta.telhadosModernos}
      />
    </>
  );
}

function InstancedPitchedHouses({
  houses,
  origin,
  wallColors = HOUSE_WALL_PITCHED,
  roofColors = HOUSE_ROOF_PITCHED,
}: {
  houses: MaqueteHouse[];
  origin: { x: number; y: number };
  wallColors?: readonly string[];
  roofColors?: readonly string[];
}) {
  const wallRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const porchRef = useRef<THREE.InstancedMesh>(null);
  const count = houses.length;

  useLayoutEffect(() => {
    const walls = wallRef.current;
    const roofs = roofRef.current;
    const porches = porchRef.current;
    if (!walls || !roofs || !porches || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const roofH = 1.55;
    for (let i = 0; i < count; i++) {
      const h = houses[i]!;
      dummy.position.set(h.x - origin.x, h.height / 2, -(h.y - origin.y));
      dummy.rotation.set(0, -h.rotation, 0);
      dummy.scale.set(h.width, h.height, h.depth);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
      color.set(wallColors[h.wallHue % wallColors.length]!);
      walls.setColorAt(i, color);

      dummy.position.set(h.x - origin.x, h.height + roofH * 0.48, -(h.y - origin.y));
      dummy.scale.set(h.width * 0.74, roofH, h.depth * 0.74);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      color.set(roofColors[h.roofHue % roofColors.length]!);
      roofs.setColorAt(i, color);

      const px = h.x + Math.cos(h.rotation + Math.PI / 2) * (h.depth * 0.36);
      const py = h.y + Math.sin(h.rotation + Math.PI / 2) * (h.depth * 0.36);
      dummy.position.set(px - origin.x, 1.05, -(py - origin.y));
      dummy.rotation.set(0, -h.rotation, 0);
      dummy.scale.set(h.width * 0.4, 2.1, h.depth * 0.28);
      dummy.updateMatrix();
      porches.setMatrixAt(i, dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    porches.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    walls.count = count;
    roofs.count = count;
    porches.count = count;
  }, [houses, origin.x, origin.y, count, wallColors, roofColors]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={wallRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.82} metalness={0.03} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, count]} castShadow>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial roughness={0.68} metalness={0.04} />
      </instancedMesh>
      <instancedMesh ref={porchRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#efeae1" roughness={0.84} metalness={0.03} />
      </instancedMesh>
    </>
  );
}

function InstancedModernHouses({
  houses,
  origin,
  wallColors = HOUSE_WALL_MODERN,
  roofColors = HOUSE_ROOF_MODERN,
}: {
  houses: MaqueteHouse[];
  origin: { x: number; y: number };
  wallColors?: readonly string[];
  roofColors?: readonly string[];
}) {
  const wallRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const annexRef = useRef<THREE.InstancedMesh>(null);
  const count = houses.length;

  useLayoutEffect(() => {
    const walls = wallRef.current;
    const roofs = roofRef.current;
    const annexes = annexRef.current;
    if (!walls || !roofs || !annexes || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const h = houses[i]!;
      dummy.position.set(h.x - origin.x, h.height / 2, -(h.y - origin.y));
      dummy.rotation.set(0, -h.rotation, 0);
      dummy.scale.set(h.width, h.height, h.depth);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
      color.set(wallColors[h.wallHue % wallColors.length]!);
      walls.setColorAt(i, color);

      dummy.position.set(h.x - origin.x, h.height + 0.1, -(h.y - origin.y));
      dummy.scale.set(h.width * 1.04, 0.2, h.depth * 1.04);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      color.set(roofColors[h.roofHue % roofColors.length]!);
      roofs.setColorAt(i, color);

      const ax = h.x + Math.cos(h.rotation) * (h.width * 0.28);
      const ay = h.y + Math.sin(h.rotation) * (h.width * 0.28);
      dummy.position.set(ax - origin.x, (h.height * 0.72) / 2, -(ay - origin.y));
      dummy.rotation.set(0, -h.rotation, 0);
      dummy.scale.set(h.width * 0.42, h.height * 0.72, h.depth * 0.55);
      dummy.updateMatrix();
      annexes.setMatrixAt(i, dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    annexes.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    walls.count = count;
    roofs.count = count;
    annexes.count = count;
  }, [houses, origin.x, origin.y, count, wallColors, roofColors]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={wallRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.74} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={annexRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7c8084" roughness={0.76} metalness={0.08} />
      </instancedMesh>
    </>
  );
}

function InstancedTrees({
  trees,
  origin,
  crownBroad = "#143f1c",
  crownConifer = "#0f3316",
  crownPalm = "#1f7a32",
  trunk = "#5c4033",
}: {
  trees: MaqueteTree[];
  origin: { x: number; y: number };
  crownBroad?: string;
  crownConifer?: string;
  crownPalm?: string;
  trunk?: string;
}) {
  const broad = useMemo(() => trees.filter((t) => t.kind === "broad"), [trees]);
  const conifer = useMemo(() => trees.filter((t) => t.kind === "conifer"), [trees]);
  const palm = useMemo(() => trees.filter((t) => t.kind === "palm"), [trees]);
  return (
    <>
      <TreeKind trees={broad} origin={origin} kind="broad" crown={crownBroad} trunk={trunk} />
      <TreeKind trees={conifer} origin={origin} kind="conifer" crown={crownConifer} trunk={trunk} />
      <TreeKind trees={palm} origin={origin} kind="palm" crown={crownPalm} trunk={trunk} />
    </>
  );
}

function TreeKind({
  trees,
  origin,
  kind,
  crown,
  trunk,
}: {
  trees: MaqueteTree[];
  origin: { x: number; y: number };
  kind: MaqueteTree["kind"];
  crown: string;
  trunk: string;
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const count = trees.length;

  useLayoutEffect(() => {
    const trunks = trunkRef.current;
    const crowns = crownRef.current;
    if (!trunks || !crowns || count === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = trees[i]!;
      const s = t.scale;
      if (kind === "palm") {
        dummy.position.set(t.x - origin.x, 1.05 * s, -(t.y - origin.y));
        dummy.scale.set(0.11 * s, 2.1 * s, 0.11 * s);
      } else {
        dummy.position.set(t.x - origin.x, 0.85 * s, -(t.y - origin.y));
        dummy.scale.set(0.28 * s, 1.7 * s, 0.28 * s);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      if (kind === "palm") {
        dummy.position.set(t.x - origin.x, 2.28 * s, -(t.y - origin.y));
        dummy.scale.set(0.92 * s, 0.38 * s, 0.92 * s);
      } else if (kind === "broad") {
        dummy.position.set(t.x - origin.x, 2.55 * s, -(t.y - origin.y));
        dummy.scale.set(1.55 * s, 1.7 * s, 1.55 * s);
      } else {
        dummy.position.set(t.x - origin.x, 3.35 * s, -(t.y - origin.y));
        dummy.scale.set(1.15 * s, 3.4 * s, 1.15 * s);
      }
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.count = count;
    crowns.count = count;
  }, [trees, origin.x, origin.y, count, kind]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={trunk} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        {kind === "conifer" ? <coneGeometry args={[1, 1, 7]} /> : <sphereGeometry args={[1, 8, 6]} />}
        <meshStandardMaterial color={crown} roughness={0.86} />
      </instancedMesh>
    </>
  );
}

function InstancedPeople({
  people,
  origin,
}: {
  people: MaquetePerson[];
  origin: { x: number; y: number };
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const count = people.length;

  useLayoutEffect(() => {
    const bodies = bodyRef.current;
    const heads = headRef.current;
    if (!bodies || !heads || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = people[i]!;
      const s = p.scale;
      dummy.position.set(p.x - origin.x, 0.14 + 0.58 * s, -(p.y - origin.y));
      dummy.rotation.set(p.walking ? 0.08 : 0, -p.rotation, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      color.set(PERSON_CLOTH[p.hue % PERSON_CLOTH.length]!);
      bodies.setColorAt(i, color);

      dummy.position.set(p.x - origin.x, 0.14 + 1.2 * s, -(p.y - origin.y));
      dummy.rotation.set(0, -p.rotation, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      color.set(PERSON_HEAD[p.hue % PERSON_HEAD.length]!);
      heads.setColorAt(i, color);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    bodies.count = count;
    heads.count = count;
  }, [people, origin.x, origin.y, count]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} castShadow>
        <capsuleGeometry args={[0.16, 0.72, 3, 6]} />
        <meshStandardMaterial roughness={0.82} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} castShadow>
        <sphereGeometry args={[0.155, 7, 6]} />
        <meshStandardMaterial roughness={0.88} metalness={0} />
      </instancedMesh>
    </>
  );
}

function InstancedCars({
  cars,
  origin,
}: {
  cars: MaqueteCar[];
  origin: { x: number; y: number };
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const count = cars.length;
  const wheelCount = count * 4;

  useLayoutEffect(() => {
    const bodies = bodyRef.current;
    const cabins = cabinRef.current;
    const wheels = wheelRef.current;
    if (!bodies || !cabins || !wheels || count === 0) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const deck = 0.06;
    for (let i = 0; i < count; i++) {
      const c = cars[i]!;
      const cx = c.x - origin.x;
      const cz = -(c.y - origin.y);
      dummy.position.set(cx, deck + 0.38, cz);
      dummy.rotation.set(0, -c.rotation, 0);
      dummy.scale.set(c.length, 0.52, c.width);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      color.set(CAR_BODY[c.hue % CAR_BODY.length]!);
      bodies.setColorAt(i, color);

      const rear = -c.length * 0.08;
      dummy.position.set(cx + Math.cos(c.rotation) * rear, deck + 0.9, cz - Math.sin(c.rotation) * rear);
      dummy.rotation.set(0, -c.rotation, 0);
      dummy.scale.set(c.length * 0.46, 0.58, c.width * 0.82);
      dummy.updateMatrix();
      cabins.setMatrixAt(i, dummy.matrix);

      const cos = Math.cos(c.rotation);
      const sin = Math.sin(c.rotation);
      const axles: [number, number][] = [
        [c.length * 0.3, c.width * 0.42],
        [c.length * 0.3, -c.width * 0.42],
        [-c.length * 0.32, c.width * 0.42],
        [-c.length * 0.32, -c.width * 0.42],
      ];
      for (let w = 0; w < 4; w++) {
        const [lx, lat] = axles[w]!;
        const wx = c.x + cos * lx - sin * lat;
        const wy = c.y + sin * lx + cos * lat;
        dummy.position.set(wx - origin.x, deck + 0.28, -(wy - origin.y));
        dummy.rotation.set(Math.PI / 2, -c.rotation, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wheels.setMatrixAt(i * 4 + w, dummy.matrix);
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    bodies.count = count;
    cabins.count = count;
    wheels.count = wheelCount;
  }, [cars, origin.x, origin.y, count, wheelCount]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.48} metalness={0.22} />
      </instancedMesh>
      <instancedMesh ref={cabinRef} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1c242c" roughness={0.28} metalness={0.35} />
      </instancedMesh>
      <instancedMesh ref={wheelRef} args={[undefined, undefined, wheelCount]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} metalness={0.08} />
      </instancedMesh>
    </>
  );
}

function DashedEixos({ eixos, origin }: { eixos: MaqueteRing[]; origin: { x: number; y: number } }) {
  return (
    <>
      {eixos.map((ring, i) => {
        const pts = ring.map((p) => [p[0]! - origin.x, 0.13, -(p[1]! - origin.y)] as [number, number, number]);
        if (pts.length < 2) return null;
        return (
          <Line
            key={i}
            points={pts}
            color="#f2d56a"
            dashed
            dashSize={2.4}
            gapSize={1.6}
            lineWidth={2.8}
          />
        );
      })}
    </>
  );
}

function StreetLabels({
  scene,
  color = "#f4efd8",
  outline = "#1f2937",
}: {
  scene: LoteamentoMaqueteScene;
  color?: string;
  outline?: string;
}) {
  const { origin } = scene;
  return (
    <>
      {scene.streetLabels.map((label, i) => (
        <Text
          key={`${label.text}-${i}`}
          position={[label.x - origin.x, 0.28, -(label.y - origin.y)]}
          rotation={[-Math.PI / 2, 0, -label.rotation]}
          fontSize={2.4}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.08}
          outlineColor={outline}
        >
          {label.text}
        </Text>
      ))}
    </>
  );
}

function BlackVoidGround({ scene, color = "#000000" }: { scene: LoteamentoMaqueteScene; color?: string }) {
  if (!MAQUETE_GLEBA_CLIP || scene.gleba.length === 0) return null;
  const size = Math.max(scene.extentM * 28, 480);
  return (
    <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      {color === "#000000" ? <meshBasicMaterial color={color} /> : <meshStandardMaterial color={color} roughness={1} />}
    </mesh>
  );
}

/** Espelho d'água no centro de cada praça (utilidade pública) — estilo humanizado. */
function PlazaPools({ polys, origin }: { polys: MaquetePoly[]; origin: { x: number; y: number } }) {
  const pools = useMemo(
    () =>
      polys.map((p) => {
        const xs = p.outer.map((q) => q[0]!);
        const ys = p.outer.map((q) => q[1]!);
        const r = Math.max(2, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.09);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, r };
      }),
    [polys],
  );
  return (
    <>
      {pools.map((p, i) => (
        <group key={i} position={[p.x - origin.x, 0, -(p.y - origin.y)]}>
          <mesh position={[0, 0.09, 0]} receiveShadow>
            <cylinderGeometry args={[p.r * 1.6, p.r * 1.6, 0.04, 40]} />
            <meshStandardMaterial color="#d8cfae" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.115, 0]}>
            <cylinderGeometry args={[p.r, p.r, 0.02, 40]} />
            <meshStandardMaterial color="#bcd3d6" roughness={0.25} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function LotBoundaryGrid({
  lots,
  origin,
  color = "#f4f6f3",
}: {
  lots: LoteamentoMaqueteScene["lots"];
  origin: { x: number; y: number };
  color?: string;
}) {
  const geom = useMemo(() => {
    const positions: number[] = [];
    for (const lot of lots) {
      const pts = toLocal(lot.ring, origin.x, origin.y);
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        positions.push(a[0], 0.085, -a[1], b[0], 0.085, -b[1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [lots, origin.x, origin.y]);

  useEffect(() => {
    return () => geom.dispose();
  }, [geom]);

  if (lots.length === 0) return null;
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function CameraRig({
  extent,
  resetNonce,
}: {
  extent: number;
  resetNonce: number;
}) {
  const { camera } = useThree();
  const dist = Math.max(extent * 0.95, 48);

  useLayoutEffect(() => {
    camera.position.set(dist * 0.88, dist * 0.62, dist * 0.52);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, dist, resetNonce]);

  return (
    <OrbitControls
      key={resetNonce}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={12}
      maxDistance={Math.max(extent * 3.2, 80)}
      maxPolarAngle={Math.PI / 2 - 0.04}
      target={[0, 0, 0]}
    />
  );
}

function MaqueteScene({
  scene,
  resetNonce,
  showPeople,
  showCars,
  showSidewalkTrees,
  showEixo,
  visual,
}: {
  scene: LoteamentoMaqueteScene;
  resetNonce: number;
  showPeople: boolean;
  showCars: boolean;
  showSidewalkTrees: boolean;
  showEixo: boolean;
  visual: MaqueteVisual;
}) {
  const P = VISUAL[visual];
  const origin = scene.origin;
  const extent = scene.extentM;
  const houses = useMemo(
    () => scene.lots.map((l) => l.house).filter((h): h is MaqueteHouse => h != null),
    [scene.lots],
  );
  const lotPolys = useMemo(
    () => scene.lots.map((l) => ({ outer: l.ring, holes: [] as MaqueteRing[] })),
    [scene.lots],
  );
  const curbs: MaqueteCurb[] = scene.curbs;
  const sun = extent * 0.7;

  return (
    <>
      <color attach="background" args={[P.fundo]} />
      <fog attach="fog" args={[P.fundo, extent * 3.8, extent * 9]} />
      <hemisphereLight args={[P.ceu, P.luzChao, P.hemisferio]} />
      <ambientLight intensity={P.ambiente} />
      <directionalLight
        position={[sun * 0.22, sun * 1.55, sun * 0.18]}
        intensity={P.sol}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-bias={-0.0002}
        shadow-radius={visual === "humanizado" ? 6 : 1}
      />
      <CameraRig extent={extent} resetNonce={resetNonce} />
      <BlackVoidGround scene={scene} color={P.chao} />
      {P.base ? (
        <ExtrudedAreas polys={scene.gleba} origin={origin} y0={-0.16} height={0.15} color={P.base} roughness={1} />
      ) : null}
      <ExtrudedAreas polys={scene.asphalt} origin={origin} y0={0} height={0.06} color={P.asfalto} roughness={0.94} />
      <ExtrudedAreas polys={scene.sidewalks} origin={origin} y0={0.04} height={0.08} color={P.calcada} roughness={0.88} />
      <InstancedBoxes items={curbs} origin={origin} color={P.meioFio} roughness={0.7} />
      {P.lote ? (
        <ExtrudedAreas polys={lotPolys} origin={origin} y0={0.012} height={0.07} color={P.lote} roughness={0.95} />
      ) : (
        <GrassLots polys={lotPolys} origin={origin} />
      )}
      <LotBoundaryGrid lots={scene.lots} origin={origin} color={P.loteLinha} />
      <InstancedHouses houses={houses} origin={origin} paleta={P} />
      <ExtrudedAreas polys={scene.reserva} origin={origin} y0={0.01} height={0.07} color={P.reserva} roughness={0.92} />
      <ExtrudedAreas polys={scene.util} origin={origin} y0={0.01} height={0.07} color={P.util} roughness={0.95} />
      {visual === "humanizado" ? <PlazaPools polys={scene.util} origin={origin} /> : null}
      <InstancedTrees
        trees={scene.trees}
        origin={origin}
        crownBroad={P.copaLarga}
        crownConifer={P.copaConifera}
        trunk={P.tronco}
      />
      <InstancedTrees
        trees={scene.utilTrees}
        origin={origin}
        crownBroad={P.copaCalcada}
        crownConifer={P.copaConifera}
        trunk={P.tronco}
      />
      {scene.medianPalms.length > 0 || scene.medians.length > 0 ? (
        <>
          <InstancedBoxes items={scene.medians} origin={origin} color={P.canteiro} roughness={0.92} yOffset={0.04} />
          <InstancedTrees trees={scene.medianPalms} origin={origin} crownPalm={P.copaPalmeira} trunk={P.tronco} />
        </>
      ) : null}
      {showSidewalkTrees ? (
        <InstancedTrees
          trees={scene.sidewalkTrees}
          origin={origin}
          crownBroad={P.copaCalcada}
          crownConifer={P.copaConifera}
          trunk={P.tronco}
        />
      ) : null}
      {showPeople ? <InstancedPeople people={scene.people} origin={origin} /> : null}
      {showCars ? <InstancedCars cars={scene.cars} origin={origin} /> : null}
      {showEixo ? (
        <>
          <InstancedBoxes items={scene.eixoDashes} origin={origin} color={P.eixo} roughness={0.42} yOffset={0.068} />
          {visual === "realista" ? <DashedEixos eixos={scene.eixos} origin={origin} /> : null}
        </>
      ) : null}
      <StreetLabels scene={scene} color={P.rotulo} outline={P.rotuloContorno} />
    </>
  );
}

export function CadLoteamentoMaquete({
  project,
  secaoTipo,
  sidewalkFallbackM,
  georef: _georef,
  onClose,
}: Props) {
  const t = useTranslations("rtkCad.loteamento.maquete");
  const [resetNonce, setResetNonce] = useState(0);
  const [showPeople, setShowPeople] = useState(true);
  const [showCars, setShowCars] = useState(true);
  const [showSidewalkTrees, setShowSidewalkTrees] = useState(true);
  const [showEixo, setShowEixo] = useState(true);
  const [visual, setVisual] = useState<MaqueteVisual>("humanizado");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("datageo.maquete.visual") === "realista") setVisual("realista");
    } catch {
      /* sem armazenamento: fica no humanizado */
    }
  }, []);
  const P = VISUAL[visual];
  const trocarVisual = (v: MaqueteVisual) => {
    setVisual(v);
    try {
      window.localStorage.setItem("datageo.maquete.visual", v);
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
  };
  const scene = useMemo(
    () =>
      buildLoteamentoMaquete(project, {
        calcadaM: secaoTipo.larguraCalcadaM || sidewalkFallbackM || 2,
        meioFioM: secaoTipo.meioFioM ?? 0.15,
        maxTrees: 320,
        maxSidewalkTrees: 22,
        maxPeople: 24,
        maxCars: 14,
      }),
    [project, secaoTipo.larguraCalcadaM, secaoTipo.meioFioM, sidewalkFallbackM],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#334155] bg-[#0f172a] px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[#e2e8f0]">{t("title")}</h2>
          <p className="truncate text-[10px] text-[#94a3b8]">{t("orbitHint")}</p>
        </div>
        <div className="inline-flex rounded-md border border-[#475569] p-0.5 text-[11px]" role="group" aria-label={t("visual")}>
          {(["humanizado", "realista"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visual === v}
              onClick={() => trocarVisual(v)}
              className={`rounded px-2.5 py-1 font-medium ${
                visual === v ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#cbd5e1] hover:bg-[#1e293b]"
              }`}
            >
              {v === "humanizado" ? t("visualHumanizado") : t("visualRealista")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#cbd5e1]">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: P.asfalto }} />
            {t("legendAsfalto")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm " style={{ background: P.meioFio }} />
            {t("legendMeioFio")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm " style={{ background: P.calcada }} />
            {t("legendCalcada")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm " style={{ background: P.lote ?? "#2f6b32" }} />
            {t("legendLotes")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm " style={{ background: P.reserva }} />
            {t("legendReserva")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm " style={{ background: P.eixo }} />
            {t("legendEixo")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[#cbd5e1]">
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#00c8f0]"
              checked={showPeople}
              onChange={(e) => setShowPeople(e.target.checked)}
            />
            {t("togglePeople")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#00c8f0]"
              checked={showCars}
              onChange={(e) => setShowCars(e.target.checked)}
            />
            {t("toggleCars")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#00c8f0]"
              checked={showSidewalkTrees}
              onChange={(e) => setShowSidewalkTrees(e.target.checked)}
            />
            {t("toggleSidewalkTrees")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#00c8f0]"
              checked={showEixo}
              onChange={(e) => setShowEixo(e.target.checked)}
            />
            {t("toggleEixo")}
          </label>
        </div>
        <button
          type="button"
          onClick={() => setResetNonce((n) => n + 1)}
          className="rounded-md border border-[#475569] px-3 py-1.5 text-xs font-medium text-[#e2e8f0] hover:bg-[#1e293b]"
        >
          {t("resetView")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-[#00c8f0] px-3 py-1.5 text-xs font-semibold text-[#0f2848] hover:bg-[#5adfff]"
        >
          {t("close")}
        </button>
      </header>
      {!scene || (!scene.hasVias && !scene.hasLotes) ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#94a3b8]">{t("empty")}</div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {!scene.hasReserva ? (
            <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/45 px-2 py-1 text-[11px] text-amber-200">
              {t("noReserva")}
            </p>
          ) : null}
          <Canvas
            shadows
            className="h-full w-full"
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            camera={{
              fov: 38,
              near: 0.4,
              far: 40000,
              position: [80, 60, 80],
            }}
            key={visual}
            onCreated={({ gl }) => {
              gl.toneMappingExposure = P.exposicao;
              gl.shadowMap.enabled = true;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
            }}
          >
            <MaqueteScene
              scene={scene}
              resetNonce={resetNonce}
              showPeople={showPeople}
              showCars={showCars}
              showSidewalkTrees={showSidewalkTrees}
              showEixo={showEixo}
              visual={visual}
            />
          </Canvas>
        </div>
      )}
    </div>
  );
}

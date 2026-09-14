"use client";

import { Grid, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import {
  buildDrainageNetwork3d,
  type Drainage3dPipeMesh,
  type Drainage3dShaftMesh,
  type Drainage3dStreetRing,
  type DrainageNetwork3dScene,
} from "@/lib/rtk-validation/cad/loteamento-drainage-3d";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

type Props = {
  project: CadProject;
  coverM?: number;
  minSlopePct?: number;
  onClose: () => void;
};

const PIPE_OK = "#1d4ed8";
const PIPE_FAIL = "#dc2626";
const PV_CONCRETE = "#8b939c";
const PV_COVER = "#3f4a58";
const INLET = "#0284c7";
const INLET_GRATE = "#0f172a";
const OUTFALL = "#b91c1c";
const STREET = "#64748b";

function toThree(
  x: number,
  y: number,
  z: number,
  origin: DrainageNetwork3dScene["origin"],
  ve: number,
): [number, number, number] {
  return [x - origin.x, (z - origin.z) * ve, -(y - origin.y)];
}

function addContour(shape: THREE.Shape | THREE.Path, pts: [number, number][]) {
  shape.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]![0], pts[i]![1]);
  shape.closePath();
}

function PipeMesh({
  pipe,
  origin,
  ve,
}: {
  pipe: Drainage3dPipeMesh;
  origin: DrainageNetwork3dScene["origin"];
  ve: number;
}) {
  const geom = useMemo(() => {
    const start = new THREE.Vector3(...toThree(pipe.start.x, pipe.start.y, pipe.start.z, origin, ve));
    const end = new THREE.Vector3(...toThree(pipe.end.x, pipe.end.y, pipe.end.z, origin, ve));
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 1e-4) return null;
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const g = new THREE.CylinderGeometry(pipe.radiusM, pipe.radiusM, len, 14);
    g.applyQuaternion(quat);
    g.translate(mid.x, mid.y, mid.z);
    return g;
  }, [pipe, origin, ve]);

  useEffect(() => {
    return () => {
      geom?.dispose();
    };
  }, [geom]);

  if (!geom) return null;
  return (
    <mesh geometry={geom} castShadow>
      <meshStandardMaterial
        color={pipe.failed ? PIPE_FAIL : PIPE_OK}
        roughness={0.32}
        metalness={0.28}
      />
    </mesh>
  );
}

function ShaftMesh({
  shaft,
  origin,
  ve,
}: {
  shaft: Drainage3dShaftMesh;
  origin: DrainageNetwork3dScene["origin"];
  ve: number;
}) {
  const [cx, , cz] = toThree(shaft.x, shaft.y, shaft.invertZ, origin, ve);
  const y0 = (shaft.invertZ - origin.z) * ve;
  const height = Math.max(shaft.heightM * ve, 0.12);
  const coverH = 0.1 * Math.min(ve, 2.4);
  const yMid = y0 + height / 2;
  const yCover = y0 + height + coverH / 2;
  const isOutfall = shaft.kind === "outfall";
  const isInlet = shaft.kind === "inlet";
  const color = isOutfall ? OUTFALL : isInlet ? INLET : PV_CONCRETE;
  const cover = isInlet ? INLET_GRATE : isOutfall ? "#7f1d1d" : PV_COVER;

  return (
    <group>
      <mesh position={[cx, yMid, cz]} castShadow receiveShadow>
        <boxGeometry args={[shaft.widthM, height, shaft.depthM]} />
        <meshStandardMaterial color={color} roughness={0.78} metalness={0.06} />
      </mesh>
      <mesh position={[cx, yCover, cz]} castShadow>
        <boxGeometry args={[shaft.widthM * 1.18, coverH, shaft.depthM * 1.18]} />
        <meshStandardMaterial color={cover} roughness={0.55} metalness={0.12} />
      </mesh>
      {isOutfall ? (
        <mesh position={[cx, yCover + 0.55 * Math.min(ve, 2), cz]}>
          <coneGeometry args={[0.28, 0.7, 10]} />
          <meshStandardMaterial color="#f97316" roughness={0.45} metalness={0.1} />
        </mesh>
      ) : null}
    </group>
  );
}

function StreetContext({
  streets,
  origin,
  groundY,
}: {
  streets: Drainage3dStreetRing[];
  origin: DrainageNetwork3dScene["origin"];
  groundY: number;
}) {
  const geoms = useMemo(() => {
    return streets
      .map((ring) => {
        if (ring.outer.length < 3) return null;
        const local: [number, number][] = ring.outer.map(([x, y]) => [x - origin.x, y - origin.y]);
        const shape = new THREE.Shape();
        addContour(shape, local);
        for (const hole of ring.holes) {
          if (hole.length < 3) continue;
          const path = new THREE.Path();
          addContour(
            path,
            hole.map(([x, y]) => [x - origin.x, y - origin.y]),
          );
          shape.holes.push(path);
        }
        const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 1 });
        geom.rotateX(-Math.PI / 2);
        geom.translate(0, groundY - 0.04, 0);
        return geom;
      })
      .filter((g): g is THREE.ExtrudeGeometry => g != null);
  }, [streets, origin.x, origin.y, groundY]);

  useEffect(() => {
    return () => {
      for (const g of geoms) g.dispose();
    };
  }, [geoms]);

  if (geoms.length === 0) return null;
  return (
    <>
      {geoms.map((geom, i) => (
        <mesh key={i} geometry={geom}>
          <meshStandardMaterial color={STREET} transparent opacity={0.28} roughness={0.95} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function DrainageLabels({
  scene,
  ve,
  show,
}: {
  scene: DrainageNetwork3dScene;
  ve: number;
  show: boolean;
}) {
  const font = Math.max(1.05, Math.min(scene.extentM * 0.018, 2.6));
  if (!show) return null;
  return (
    <>
      {scene.shafts.map((s) => {
        if (!s.label) return null;
        const [x, y, z] = toThree(s.x, s.y, s.groundZ, scene.origin, ve);
        const lines = s.cfct ? `${s.label}\n${s.cfct}` : s.label;
        return (
          <Text
            key={s.id}
            position={[x, y + 0.35 * ve + 0.4, z]}
            fontSize={s.kind === "inlet" ? font * 0.72 : font}
            color={s.kind === "outfall" ? "#fdba74" : "#e2e8f0"}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.04}
            outlineColor="#0b1220"
          >
            {lines}
          </Text>
        );
      })}
      {scene.pipes.map((p) => {
        if (!p.label) return null;
        const [x, y, z] = toThree(p.midpoint.x, p.midpoint.y, p.midpoint.z, scene.origin, ve);
        return (
          <Text
            key={p.id}
            position={[x, y + p.radiusM + 0.25, z]}
            fontSize={font * 0.82}
            color={p.failed ? "#fecaca" : "#93c5fd"}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.035}
            outlineColor="#0b1220"
          >
            {p.label}
          </Text>
        );
      })}
    </>
  );
}

function CameraRig({
  extent,
  targetY,
  resetNonce,
}: {
  extent: number;
  targetY: number;
  resetNonce: number;
}) {
  const { camera } = useThree();
  const dist = Math.max(extent * 0.95, 36);

  useLayoutEffect(() => {
    camera.position.set(dist * 0.92, dist * 0.48 + targetY, dist * 0.58);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
  }, [camera, dist, targetY, resetNonce]);

  return (
    <OrbitControls
      key={resetNonce}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={Math.max(extent * 3.4, 90)}
      maxPolarAngle={Math.PI - 0.12}
      target={[0, targetY, 0]}
    />
  );
}

function DrainageScene({
  scene,
  resetNonce,
  ve,
  showLabels,
  showStreets,
}: {
  scene: DrainageNetwork3dScene;
  resetNonce: number;
  ve: number;
  showLabels: boolean;
  showStreets: boolean;
}) {
  const extent = scene.extentM;
  const groundY = (scene.medianGroundZ - scene.origin.z) * ve;
  const targetY = Math.max(groundY * 0.45, 0.8);
  const sun = extent * 0.7;

  return (
    <>
      <color attach="background" args={["#0b1628"]} />
      <fog attach="fog" args={["#0b1628", extent * 2.4, extent * 6]} />
      <hemisphereLight args={["#dbeafe", "#1e293b", 0.7]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[sun * 0.3, sun * 1.2, sun * 0.22]}
        intensity={1.05}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00025}
      />
      <CameraRig extent={extent} targetY={targetY} resetNonce={resetNonce} />
      <Grid
        infiniteGrid
        fadeDistance={extent * 2.8}
        fadeStrength={1.2}
        sectionColor="#1e3a5f"
        cellColor="#132238"
        sectionSize={20}
        cellSize={5}
        position={[0, 0.01, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
        <planeGeometry args={[extent * 1.8, extent * 1.8]} />
        <meshStandardMaterial color="#16301c" transparent opacity={0.42} roughness={0.96} depthWrite={false} />
      </mesh>
      {showStreets ? <StreetContext streets={scene.streets} origin={scene.origin} groundY={groundY} /> : null}
      {scene.pipes.map((p) => (
        <PipeMesh key={p.id} pipe={p} origin={scene.origin} ve={ve} />
      ))}
      {scene.shafts.map((s) => (
        <ShaftMesh key={s.id} shaft={s} origin={scene.origin} ve={ve} />
      ))}
      <DrainageLabels scene={scene} ve={ve} show={showLabels} />
    </>
  );
}

export function CadDrenagem3d({ project, coverM, minSlopePct, onClose }: Props) {
  const t = useTranslations("rtkCad.drenagem");
  const [resetNonce, setResetNonce] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [showStreets, setShowStreets] = useState(true);
  const [exaggerate, setExaggerate] = useState(false);
  const scene = useMemo(
    () => buildDrainageNetwork3d(project, { coverM, minSlopePct }),
    [project, coverM, minSlopePct],
  );
  const ve = exaggerate ? 3 : 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0b1220] text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#1e3a5f] bg-[#0f172a] px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[#e2e8f0]">{t("view3dTitle")}</h2>
          <p className="truncate text-[10px] text-[#94a3b8]">{t("view3dOrbit")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#cbd5e1]">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PIPE_OK }} />
            {t("view3dLegendPipe")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PIPE_FAIL }} />
            {t("view3dLegendPipeFail")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PV_CONCRETE }} />
            {t("view3dLegendPv")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: INLET }} />
            {t("view3dLegendInlet")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OUTFALL }} />
            {t("view3dLegendOutfall")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STREET }} />
            {t("view3dLegendStreet")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[#cbd5e1]">
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#38bdf8]"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            {t("view3dShowLabels")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#38bdf8]"
              checked={showStreets}
              onChange={(e) => setShowStreets(e.target.checked)}
            />
            {t("view3dShowStreets")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-[#38bdf8]"
              checked={exaggerate}
              onChange={(e) => setExaggerate(e.target.checked)}
            />
            {t("view3dExaggerate")}
          </label>
        </div>
        <button
          type="button"
          onClick={() => setResetNonce((n) => n + 1)}
          className="rounded-md border border-[#475569] px-3 py-1.5 text-xs font-medium text-[#e2e8f0] hover:bg-[#1e293b]"
        >
          {t("view3dReset")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-[#38bdf8] px-3 py-1.5 text-xs font-semibold text-[#0f2848] hover:bg-[#7dd3fc]"
        >
          {t("view3dClose")}
        </button>
      </header>
      {!scene ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#94a3b8]">{t("view3dEmpty")}</div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {scene.schematic ? (
            <p className="pointer-events-none absolute left-3 top-3 z-10 max-w-md rounded-md bg-black/50 px-2 py-1 text-[11px] text-amber-200">
              {t("view3dSchematic")}
            </p>
          ) : null}
          <Canvas
            shadows
            className="h-full w-full"
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            camera={{
              fov: 40,
              near: 0.3,
              far: 50000,
              position: [80, 50, 80],
            }}
            onCreated={({ gl }) => {
              gl.toneMappingExposure = 1.12;
              gl.shadowMap.enabled = true;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
            }}
          >
            <DrainageScene
              scene={scene}
              resetNonce={resetNonce}
              ve={ve}
              showLabels={showLabels}
              showStreets={showStreets}
            />
          </Canvas>
        </div>
      )}
    </div>
  );
}

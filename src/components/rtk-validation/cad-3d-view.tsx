"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadEntity, CadLayer } from "@/lib/rtk-validation/cad/types";
import { buildScene3DData, hexToRgb, type Scene3DData } from "@/lib/rtk-validation/cad/scene-3d";

type Cad3dViewProps = {
  entities: CadEntity[];
  layers: CadLayer[];
  preferTin?: boolean;
  className?: string;
};

type ThreeModule = typeof import("three");
type OrbitControlsType = typeof import("three/addons/controls/OrbitControls.js").OrbitControls;

function safeBuildScene3DData(
  entities: CadEntity[],
  layers: CadLayer[],
  preferTin: boolean,
): { data: Scene3DData | null; error: string | null } {
  try {
    return {
      data: buildScene3DData(entities, layers, { preferTin }),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Falha ao montar cena 3D.",
    };
  }
}

function disposeObject3D(obj: import("three").Object3D) {
  obj.traverse((child) => {
    if (
      "geometry" in child &&
      child.geometry &&
      typeof (child.geometry as { dispose?: () => void }).dispose === "function"
    ) {
      (child.geometry as { dispose: () => void }).dispose();
    }
    if ("material" in child && child.material) {
      const material = child.material;
      const disposeMaterial = (m: unknown) => {
        if (
          m &&
          typeof m === "object" &&
          "dispose" in m &&
          typeof (m as { dispose?: () => void }).dispose === "function"
        ) {
          (m as { dispose: () => void }).dispose();
        }
      };
      if (Array.isArray(material)) material.forEach(disposeMaterial);
      else disposeMaterial(material);
    }
  });
}

function fitCameraToScene(
  THREE: ThreeModule,
  camera: import("three").PerspectiveCamera,
  controls: InstanceType<OrbitControlsType>,
  data: Scene3DData,
) {
  const box = new THREE.Box3();
  const addPoint = (x: number, y: number, z: number) => {
    box.expandByPoint(new THREE.Vector3(x, y, z));
  };

  for (const line of data.lines) {
    addPoint(line.x1, line.y1, line.z1);
    addPoint(line.x2, line.y2, line.z2);
  }
  for (const point of data.points) {
    addPoint(point.x, point.y, point.z);
  }
  if (data.terrain) {
    const pos = data.terrain.positions;
    for (let i = 0; i < pos.length; i += 3) {
      addPoint(pos[i], pos[i + 1], pos[i + 2]);
    }
  }

  if (box.isEmpty()) {
    box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 10));
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.85, center.z + distance);
  camera.near = Math.max(maxDim / 5000, 0.01);
  camera.far = Math.max(maxDim * 500, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = maxDim * 0.05;
  controls.maxDistance = maxDim * 20;
  controls.update();
}

export function Cad3dView({ entities, layers, preferTin = false, className }: Cad3dViewProps) {
  const t = useTranslations("rtkCad.view3d");
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const { data: sceneData, error: buildError } = useMemo(
    () => safeBuildScene3DData(entities, layers, preferTin),
    [entities, layers, preferTin],
  );

  useEffect(() => {
    if (!sceneData) return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: InstanceType<OrbitControlsType> | null = null;
    let root: import("three").Group | null = null;
    let grid: import("three").GridHelper | null = null;

    const setup = async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        if (disposed || !containerRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1220);

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10_000_000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = true;
        controls.screenSpacePanning = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(1, 2, 1.5);
        scene.add(sun);
        scene.add(new THREE.HemisphereLight(0xbfdfff, 0x223044, 0.35));

        root = new THREE.Group();
        scene.add(root);

        if (sceneData.terrain) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(sceneData.terrain.positions, 3));
          geometry.setAttribute("color", new THREE.BufferAttribute(sceneData.terrain.colors, 3));
          geometry.setIndex(new THREE.BufferAttribute(sceneData.terrain.indices, 1));
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              roughness: 0.82,
              metalness: 0.04,
            }),
          );
          root.add(mesh);
        }

        if (sceneData.lines.length > 0) {
          const positions = new Float32Array(sceneData.lines.length * 6);
          const colors = new Float32Array(sceneData.lines.length * 6);
          sceneData.lines.forEach((line, i) => {
            const base = i * 6;
            positions[base] = line.x1;
            positions[base + 1] = line.y1;
            positions[base + 2] = line.z1;
            positions[base + 3] = line.x2;
            positions[base + 4] = line.y2;
            positions[base + 5] = line.z2;
            const [r, g, b] = hexToRgb(line.color);
            colors[base] = r;
            colors[base + 1] = g;
            colors[base + 2] = b;
            colors[base + 3] = r;
            colors[base + 4] = g;
            colors[base + 5] = b;
          });
          const lineGeom = new THREE.BufferGeometry();
          lineGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          lineGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          const lineMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
          });
          root.add(new THREE.LineSegments(lineGeom, lineMat));
        }

        if (sceneData.points.length > 0) {
          const positions = new Float32Array(sceneData.points.length * 3);
          const colors = new Float32Array(sceneData.points.length * 3);
          sceneData.points.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const [r, g, b] = hexToRgb(p.color);
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
          });
          const pointGeom = new THREE.BufferGeometry();
          pointGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          pointGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          root.add(
            new THREE.Points(
              pointGeom,
              new THREE.PointsMaterial({
                size: 8,
                sizeAttenuation: true,
                vertexColors: true,
              }),
            ),
          );
        }

        const span = Math.max(
          sceneData.bounds.maxX - sceneData.bounds.minX,
          sceneData.bounds.maxZ - sceneData.bounds.minZ,
          1,
        );
        grid = new THREE.GridHelper(span * 1.25, 20, 0x475569, 0x1e293b);
        grid.position.y = sceneData.bounds.minY - 0.05;
        scene.add(grid);

        const axes = new THREE.AxesHelper(Math.max(span * 0.15, 1));
        scene.add(axes);

        fitCameraToScene(THREE, camera, controls, sceneData);

        const resize = () => {
          if (!renderer || !containerRef.current) return;
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          if (w <= 0 || h <= 0) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        };

        const observer = new ResizeObserver(resize);
        observer.observe(container);

        requestAnimationFrame(resize);

        const animate = () => {
          if (disposed) return;
          frameId = requestAnimationFrame(animate);
          controls?.update();
          renderer?.render(scene, camera);
        };
        animate();

        setWebglError(null);

        return () => {
          observer.disconnect();
        };
      } catch (err) {
        setWebglError(err instanceof Error ? err.message : t("webglError"));
      }
    };

    const cleanupPromise = setup();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      void cleanupPromise;
      controls?.dispose();
      if (root) disposeObject3D(root);
      if (grid) {
        grid.geometry.dispose();
        if (Array.isArray(grid.material)) grid.material.forEach((m) => m.dispose());
        else grid.material.dispose();
      }
      renderer?.dispose();
      if (renderer?.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sceneData, t]);

  const hasTerrain = sceneData?.terrain != null;
  const entityCount = (sceneData?.lines.length ?? 0) + (sceneData?.points.length ?? 0);
  const isEmpty = entityCount === 0 && !hasTerrain;

  if (buildError) {
    return (
      <div className="flex h-[560px] items-center justify-center bg-[#0b1220] p-6 text-center text-sm text-red-300">
        {buildError}
      </div>
    );
  }

  if (webglError) {
    return (
      <div className="flex h-[560px] items-center justify-center bg-[#0b1220] p-6 text-center text-sm text-red-300">
        {webglError}
      </div>
    );
  }

  return (
    <div className={className ?? "relative h-[560px] w-full bg-[#0b1220]"}>
      <div ref={containerRef} className="absolute inset-0" />
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#94a3b8]">
          {t("empty")}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="rounded-md bg-black/50 px-2 py-1 text-[10px] text-[#cbd5e1] backdrop-blur-sm">
          {t("hint")}
        </div>
        <div className="rounded-md bg-black/50 px-2 py-1 text-[10px] text-[#94a3b8] backdrop-blur-sm">
          {hasTerrain ? t("terrainOn") : t("terrainOff")} · {t("elements", { count: entityCount })}
        </div>
      </div>
    </div>
  );
}

"use client";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox } from "@react-three/drei";
import { useState, useRef, useMemo } from "react";
import * as THREE from "three";
import { tenants, Tenant, TenantStatus } from "@/data/tenants";

function getColor(status: TenantStatus): string {
  switch (status) {
    case "current": return "#10b981";
    case "past_due": return "#ef4444";
    case "locked_out": return "#f59e0b";
    case "vacant": return "#9ca3af";
    case "expiring_soon": return "#4f6ef7";
  }
}

function UnitBox({
  tenant,
  position,
  size,
  onSelect,
  isSelected,
}: {
  tenant: Tenant;
  position: [number, number, number];
  size: [number, number, number];
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = getColor(tenant.status);

  useFrame(() => {
    if (meshRef.current) {
      const target = isSelected ? position[1] + 0.3 : hovered ? position[1] + 0.15 : position[1];
      meshRef.current.position.y += (target - meshRef.current.position.y) * 0.1;
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(tenant); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered || isSelected ? 0.95 : 0.75}
          emissive={color}
          emissiveIntensity={hovered || isSelected ? 0.3 : 0.05}
        />
      </mesh>
      {/* Unit label */}
      <Text
        position={[position[0], position[1] + size[1] / 2 + 0.15, position[2]]}
        fontSize={0.18}
        color="#1a1a2e"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {tenant.unit}
      </Text>
    </group>
  );
}

function BuildingLabel({ position, text, subtitle }: { position: [number, number, number]; text: string; subtitle: string }) {
  return (
    <group position={position}>
      <Text fontSize={0.35} color="#1a1a2e" anchorX="center" anchorY="bottom" font={undefined} fontWeight={700}>
        {text}
      </Text>
      <Text position={[0, -0.35, 0]} fontSize={0.18} color="#6b7280" anchorX="center" anchorY="bottom" font={undefined}>
        {subtitle}
      </Text>
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[60, 40]} />
      <meshStandardMaterial color="#e8ebe4" />
    </mesh>
  );
}

function ParkingLot({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#d1d5db" />
    </mesh>
  );
}

function Road({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#374151" />
    </mesh>
  );
}

function Scene({ onSelect, selectedUnit }: { onSelect: (t: Tenant) => void; selectedUnit: string | null }) {
  // Layout: Building A (left), Building C (center), Building D (right)
  // Building A units
  const buildingA = tenants.filter(t => t.building === "A");
  const buildingC1 = tenants.filter(t => t.building === "C" && !t.unit.startsWith("C-3"));
  const buildingC3 = tenants.filter(t => t.building === "C" && t.unit.startsWith("C-3"));
  const buildingD = tenants.filter(t => t.building === "D");

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Ground & Infrastructure */}
      <Ground />
      <Road position={[0, 0.01, -8]} size={[50, 2]} />
      <Road position={[0, 0.01, 8]} size={[50, 1.5]} />
      <ParkingLot position={[-12, 0.01, -5.5]} size={[14, 3]} />
      <ParkingLot position={[2, 0.01, -5.5]} size={[18, 3]} />
      <ParkingLot position={[17, 0.01, -5.5]} size={[10, 3]} />

      {/* Building A — Industrial / Warehouse (left side) */}
      <BuildingLabel position={[-12, 3.5, 2]} text="Building A" subtitle="Industrial / Warehouse" />
      {/* Building A base platform */}
      <mesh position={[-12, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[15, 7]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      {buildingA.map((t, i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        const x = -17.5 + col * 1.8;
        const z = -1.5 + row * 3;
        const height = t.sqft > 5000 ? 1.8 : t.sqft > 3000 ? 1.4 : 1.0;
        return (
          <UnitBox
            key={t.unit}
            tenant={t}
            position={[x, height / 2, z]}
            size={[1.5, height, 2.2]}
            onSelect={onSelect}
            isSelected={selectedUnit === t.unit}
          />
        );
      })}

      {/* Building C Floor 1-2 (center) */}
      <BuildingLabel position={[2, 4.5, 2]} text="Building C" subtitle="Office (Floors 1-2)" />
      <mesh position={[2, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 7]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      {buildingC1.map((t, i) => {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const x = -5.5 + col * 1.7;
        const z = -1.5 + row * 3;
        const height = t.sqft > 4000 ? 1.6 : t.sqft > 2000 ? 1.2 : 0.9;
        return (
          <UnitBox
            key={t.unit}
            tenant={t}
            position={[x, height / 2, z]}
            size={[1.4, height, 2.2]}
            onSelect={onSelect}
            isSelected={selectedUnit === t.unit}
          />
        );
      })}

      {/* Building C Floor 3 (center, elevated) */}
      <BuildingLabel position={[2, 5.5, 5.5]} text="Floor 3" subtitle="" />
      <mesh position={[2, 0.05, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 3.5]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      {buildingC3.map((t, i) => {
        const x = -4 + i * 1.7;
        const height = t.sqft > 2000 ? 1.3 : 1.0;
        return (
          <UnitBox
            key={t.unit}
            tenant={t}
            position={[x, height / 2, 5]}
            size={[1.4, height, 2.5]}
            onSelect={onSelect}
            isSelected={selectedUnit === t.unit}
          />
        );
      })}

      {/* Building D — Warehouse (right side) */}
      <BuildingLabel position={[17, 4, 2]} text="Building D" subtitle="Warehouse / Industrial" />
      <mesh position={[17, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 7]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>
      {buildingD.map((t, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 14.5 + col * 3;
        const z = -1.5 + row * 3;
        const height = t.sqft > 8000 ? 2.5 : t.sqft > 5000 ? 2.0 : 1.5;
        return (
          <UnitBox
            key={t.unit}
            tenant={t}
            position={[x, height / 2, z]}
            size={[2.5, height, 2.2]}
            onSelect={onSelect}
            isSelected={selectedUnit === t.unit}
          />
        );
      })}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={5}
        maxDistance={35}
        target={[2, 0, 1]}
      />
    </>
  );
}

export default function SitePlan3D({ onSelect, selectedUnit }: { onSelect: (t: Tenant) => void; selectedUnit: string | null }) {
  return (
    <div className="w-full h-[600px] bg-gradient-to-b from-[#dbeafe] to-[#e0e7ff] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <Canvas
        camera={{ position: [0, 18, 22], fov: 50 }}
        shadows
      >
        <Scene onSelect={onSelect} selectedUnit={selectedUnit} />
      </Canvas>
    </div>
  );
}

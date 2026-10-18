import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface Video360ViewerProps {
  videoElement: HTMLVideoElement | null;
  projectionMode: string;
  stereoMode?: string;
}

const VideoSphere = ({ videoElement, projectionMode, stereoMode = '2D' }: Video360ViewerProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl, camera } = useThree();

  // Zoom effect using mouse scroll or touchpad pinch on camera FOV
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (camera instanceof THREE.PerspectiveCamera) {
        // Soft and smooth camera FOV zoom speed
        const zoomSpeed = 0.04;
        let newFov = camera.fov + e.deltaY * zoomSpeed;
        // Batasi FOV biar ga distorsi aneh (min 20 ter-zoom in, max 110 wide view)
        newFov = Math.max(20, Math.min(110, newFov));
        camera.fov = newFov;
        camera.updateProjectionMatrix();
      }
    };

    let touchStartDist = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDist > 0 && camera instanceof THREE.PerspectiveCamera) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Sensitivitas cubitan dua jari biar kerasa asyik
        const factor = touchStartDist / dist;
        let newFov = camera.fov * factor;
        newFov = Math.max(20, Math.min(110, newFov));
        camera.fov = newFov;
        camera.updateProjectionMatrix();
        
        touchStartDist = dist;
      }
    };

    const handleTouchEnd = () => {
      touchStartDist = 0;
    };

    const dom = gl.domElement;
    dom.addEventListener('wheel', handleWheel, { passive: false });
    dom.addEventListener('touchstart', handleTouchStart, { passive: true });
    dom.addEventListener('touchmove', handleTouchMove, { passive: false });
    dom.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('touchstart', handleTouchStart);
      dom.removeEventListener('touchmove', handleTouchMove);
      dom.removeEventListener('touchend', handleTouchEnd);
    };
  }, [camera, gl]);

  useEffect(() => {
    if (!videoElement || !meshRef.current) return;

    const texture = new THREE.VideoTexture(videoElement);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    
    // Handle Stereo Mode
    if (stereoMode === 'Side-by-Side') {
      texture.repeat.set(0.5, 1);
      texture.offset.set(0, 0); // Left eye
    } else if (stereoMode === 'Top-Bottom') {
      texture.repeat.set(1, 0.5);
      texture.offset.set(0, 0.5); // Top eye
    } else {
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
    }
    
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    if (projectionMode === 'Cubemap') {
      geometry = new THREE.BoxGeometry(500, 500, 500);
      // Basic cubemap mapping (requires specific video layout, assuming 3x2 or 2x3 standard)
      // This is a simplified fallback
      material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    } else if (projectionMode === 'Display 4x90° camera angles') {
      // 4 flat planes arranged in a square
      geometry = new THREE.CylinderGeometry(500, 500, 500, 4, 1, true);
      material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    } else {
      // Default: Equirectangular, Dual Fisheye, EAC
      // For Dual Fisheye and EAC, a custom shader is truly needed for correct distortion.
      // Here we use a standard sphere as a fallback/base.
      geometry = new THREE.SphereGeometry(500, 60, 40);
      
      if (projectionMode === 'Dual Fisheye' && stereoMode === '2D') {
        // Simple UV remap for side-by-side fisheye (approximation) if not already handled by stereoMode
        texture.repeat.set(0.5, 1);
        texture.offset.set(0, 0);
      }
      
      material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    }

    if (meshRef.current.geometry) {
      meshRef.current.geometry.dispose();
    }
    meshRef.current.geometry = geometry;
    
    if (Array.isArray(meshRef.current.material)) {
      meshRef.current.material.forEach(m => m.dispose());
    } else if (meshRef.current.material) {
      meshRef.current.material.dispose();
    }
    
    meshRef.current.material = material;

    return () => {
      texture.dispose();
    };
  }, [videoElement, projectionMode, stereoMode]);

  return (
    <mesh ref={meshRef} scale={[-1, 1, 1]}>
      {/* Geometry and material are managed in useEffect */}
    </mesh>
  );
};

export const Video360Viewer = ({ videoElement, projectionMode, stereoMode = '2D' }: Video360ViewerProps) => {
  if (!videoElement) return null;

  return (
    <div className="absolute inset-0 z-10 w-full h-full bg-black">
      <Canvas camera={{ position: [0, 0, 0.1], fov: 75 }}>
        <OrbitControls 
          enableZoom={false} 
          enablePan={false} 
          enableDamping={true} 
          dampingFactor={0.05} 
          rotateSpeed={-0.5} // Invert rotation for intuitive looking around
        />
        <VideoSphere videoElement={videoElement} projectionMode={projectionMode} stereoMode={stereoMode} />
      </Canvas>
    </div>
  );
};

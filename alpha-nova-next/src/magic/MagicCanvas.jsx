import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { particleCountFor, shouldUseMagic } from './qualityGovernor.js';
import { nextQuality } from './qualityGovernor.js';

export default function MagicCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let webgl = true;
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
        || document.createElement('canvas').getContext('webgl');
      webgl = !!gl;
    } catch { webgl = false; }
    if (!shouldUseMagic({ flag: import.meta.env.VITE_MAGIC ?? 'on', webgl, reducedMotion })) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 8;

    const isMobile = window.matchMedia?.('(max-width: 760px)').matches ?? false;
    let level = 'full';
    const count = particleCountFor(level, isMobile);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const gold = new THREE.Color('#f2d894');
    const ice = new THREE.Color('#9df0ec');
    const ember = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      const roll = Math.random();
      const c = roll > 0.92 ? ember : roll > 0.45 ? gold : ice;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Soft round sprite so points render as glowing dust, not squares.
    const sprite = (() => {
      const s = document.createElement('canvas');
      s.width = 64;
      s.height = 64;
      const ctx = s.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(s);
      tex.needsUpdate = true;
      return tex;
    })();
    const mat = new THREE.PointsMaterial({
      size: 0.14, map: sprite, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let mx = 0;
    let my = 0;
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 0.9;
      my = (e.clientY / window.innerHeight - 0.5) * -0.6;
    };
    if (!isMobile) window.addEventListener('pointermove', onMove);

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const start = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      frames += 1;
      if (now - last >= 1000) {
        const fps = (frames * 1000) / (now - last);
        frames = 0;
        last = now;
        const next = nextQuality(fps, level);
        if (next !== level) {
          level = next;
          if (level === 'static') {
            cancelAnimationFrame(raf);
            canvas.style.display = 'none';
            return;
          }
          const n = particleCountFor(level, isMobile);
          const g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n * 3), 3));
          g2.setAttribute('color', new THREE.BufferAttribute(col.slice(0, n * 3), 3));
          points.geometry.dispose();
          points.geometry = g2;
          geo = g2;
        }
      }
      const t = (now - start) / 1000;
      points.rotation.y += 0.0009;
      points.position.y = Math.sin(t * 0.25) * 0.35;
      points.rotation.x += (my * 0.35 - points.rotation.x) * 0.02;
      points.rotation.y += mx * 0.35 * 0.01;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      geo.dispose();
      mat.dispose();
      sprite.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <div className="magic-aurora magic-aurora-a" aria-hidden="true" />
      <div className="magic-aurora magic-aurora-b" aria-hidden="true" />
      <canvas ref={ref} className="magic-canvas" aria-hidden="true" />
    </>
  );
}

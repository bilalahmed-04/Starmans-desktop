import { useEffect, useRef } from 'react';

const DOT_SPACING = 18;
const DOT_RADIUS = 1.5;
const BULGE_STRENGTH = 55;
const CURSOR_RADIUS = 320;
const GLOW_RADIUS = 150;
const MOVE_SPEED = 0.1; // Responsive movement speed
const FADE_SPEED = 0.08; // Smooth fade in/out speed for glow

const GOLD: [number, number, number] = [176, 141, 87];
const NAVY: [number, number, number] = [27, 42, 65];

export default function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;
    let mouseX = -9999;
    let mouseY = -9999;
    let animId = 0;
    let needsRender = true;

    let offsetsX: Float32Array;
    let offsetsY: Float32Array;
    let glows: Float32Array;
    let cols = 0;
    let rows = 0;

    function resize() {
      const parent = canvas!.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(width / DOT_SPACING) + 1;
      rows = Math.ceil(height / DOT_SPACING) + 1;
      const total = cols * rows;
      offsetsX = new Float32Array(total);
      offsetsY = new Float32Array(total);
      glows = new Float32Array(total);
      needsRender = true;
    }

    function resetMouse() {
      mouseX = -9999;
      mouseY = -9999;
      needsRender = true;
    }

    function onMouseMove(e: MouseEvent) {
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        resetMouse();
        return;
      }
      const rect = canvas!.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      needsRender = true;
    }

    function onMouseOut(e: MouseEvent) {
      // Fires when the pointer actually leaves the document (relatedTarget is
      // null/outside the page). More reliable across browsers than
      // document 'mouseleave', which can fail to fire on fast exits.
      const to = e.relatedTarget as Node | null;
      if (!to || !document.documentElement.contains(to)) {
        resetMouse();
      }
    }

    function draw() {
      let stillMoving = false;
      const total = cols * rows;

      for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = (i - col) / cols;
        const baseX = col * DOT_SPACING;
        const baseY = row * DOT_SPACING;

        const dx = baseX - mouseX;
        const dy = baseY - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let targetOffX = 0;
        let targetOffY = 0;
        let targetGlow = 0;

        if (dist < CURSOR_RADIUS && dist > 0.001) {
          const push = (1 - dist / CURSOR_RADIUS) * BULGE_STRENGTH;
          targetOffX = (dx / dist) * push;
          targetOffY = (dy / dist) * push;
        }

        if (dist < GLOW_RADIUS) {
          targetGlow = 1 - dist / GLOW_RADIUS;
        }

        // Lerp offsets and glow
        offsetsX[i] += (targetOffX - offsetsX[i]) * MOVE_SPEED;
        offsetsY[i] += (targetOffY - offsetsY[i]) * MOVE_SPEED;
        glows[i] += (targetGlow - glows[i]) * FADE_SPEED;

        // Snap to zero when very close to avoid micro-displacements remaining stuck
        if (targetOffX === 0 && Math.abs(offsetsX[i]) < 0.01) offsetsX[i] = 0;
        if (targetOffY === 0 && Math.abs(offsetsY[i]) < 0.01) offsetsY[i] = 0;
        if (targetGlow === 0 && glows[i] < 0.001) glows[i] = 0;

        if (offsetsX[i] !== 0 || offsetsY[i] !== 0 || glows[i] !== 0 || targetOffX !== 0 || targetOffY !== 0) {
          stillMoving = true;
        }
      }

      if (needsRender || stillMoving) {
        ctx!.clearRect(0, 0, width, height);

        for (let i = 0; i < total; i++) {
          const col = i % cols;
          const row = (i - col) / cols;
          const baseX = col * DOT_SPACING;
          const baseY = row * DOT_SPACING;
          const x = baseX + offsetsX[i];
          const y = baseY + offsetsY[i];

          const t = width > 0 ? Math.min(Math.max(baseX / width, 0), 1) : 0;
          const baseOpacity = 0.38 - t * 0.1;
          const glow = glows[i];

          if (glow > 0.02) {
            const opacity = 0.25 + glow * 0.45;
            ctx!.fillStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${opacity.toFixed(3)})`;
          } else {
            const r = GOLD[0] + (NAVY[0] - GOLD[0]) * t;
            const g = GOLD[1] + (NAVY[1] - GOLD[1]) * t;
            const b = GOLD[2] + (NAVY[2] - GOLD[2]) * t;
            ctx!.fillStyle = `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},${baseOpacity.toFixed(3)})`;
          }

          ctx!.beginPath();
          ctx!.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx!.fill();
        }

        needsRender = stillMoving;
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('blur', resetMouse);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', resetMouse);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('visibilitychange', resetMouse);
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', resetMouse);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', resetMouse);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('visibilitychange', resetMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  );
}

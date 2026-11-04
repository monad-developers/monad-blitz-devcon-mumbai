"use client";

import { useEffect, useRef } from "react";

const GLYPHS = "$€¥₹£¢₿0123456789%+×÷=<>{}[]#MORNEY".split("");
const CELL = 20;
const TICK_MS = 90;
const GLOW_RADIUS = 180;

// Full-viewport canvas of faint, flickering currency glyphs.
// Glyphs near the cursor light up in the brand lavender.
export function GlyphField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cols = 0;
    let rows = 0;
    let chars: string[] = [];
    let alphas: number[] = [];
    let raf = 0;
    let last = 0;
    const pointer = { x: -9999, y: -9999 };

    const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
    const randomAlpha = () => 0.03 + Math.random() * 0.09;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mono = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-roboto-mono")
        .trim();
      ctx.font = `12px ${mono ? `${mono}, ` : ""}ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      chars = Array.from({ length: cols * rows }, randomGlyph);
      alphas = Array.from({ length: cols * rows }, randomAlpha);
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = c * CELL + CELL / 2;
          const y = r * CELL + CELL / 2;
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          const glow = Math.max(0, 1 - d / GLOW_RADIUS);
          if (glow > 0) {
            ctx.fillStyle = `rgba(110, 84, 255, ${alphas[i] + glow * 0.55})`;
          } else {
            ctx.fillStyle = `rgba(14, 9, 28, ${alphas[i] * 0.8})`;
          }
          ctx.fillText(chars[i], x, y);
        }
      }
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < TICK_MS) return;
      last = t;
      const flips = Math.ceil(chars.length * 0.015);
      for (let k = 0; k < flips; k++) {
        const i = (Math.random() * chars.length) | 0;
        chars[i] = randomGlyph();
        alphas[i] = randomAlpha();
      }
      draw();
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (reduceMotion) draw();
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
      if (reduceMotion) draw();
    };
    const onResize = () => {
      resize();
      draw();
    };

    resize();
    draw();
    if (!reduceMotion) raf = requestAnimationFrame(loop);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,color-mix(in_srgb,var(--background)_70%,transparent)_100%)]" />
    </div>
  );
}

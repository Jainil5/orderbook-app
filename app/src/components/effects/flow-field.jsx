import { useEffect, useRef } from 'react';

/* Curl-noise flow field, ported from the Dark Botanical spec §5.1.
   620 particles leave 1.1px streaks rather than dots: each frame fades the
   canvas with a translucent wash of the page colour instead of clearing it,
   which is what smears the tails. */

const COUNT = 620;
const SCALE = 0.0021;
const TIME_STEP = 0.0022;
const POINTER_RADIUS = 240;
const MAX_DPR = 1.5;
const TRAIL = 'rgba(6, 18, 13, 0.055)';
const SPEED_LEAF = 1.15;
const SPEED_SAND = 1.5;

/* Strokes are batched by alpha so one path per tone/bucket pair replaces 620
   stroke calls per frame. */
const LEAF = [95, 214, 138, 0.2, 0.3];
const SAND = [210, 195, 145, 0.16, 0.34];
const BUCKETS = 4;

function angleAt(x, y, t) {
  return (
    (Math.sin(x * 1.1 + t) * 0.5 +
      Math.sin(y * 1.7 - t * 0.8) * 0.3 +
      Math.sin((x + y) * 0.7 + t * 1.3) * 0.2) *
    Math.PI *
    1.6
  );
}

function spawn(p, width, height) {
  p.x = Math.random() * width;
  p.y = Math.random() * height;
  p.life = 60 + Math.random() * 180;
}

export function FlowField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let frame = 0;
    let t = Math.random() * 1000;
    const pointer = { x: -9999, y: -9999, active: false };
    const bias = { x: 0, y: 0 };
    const particles = Array.from({ length: COUNT }, (_, i) => ({
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      life: 0,
      sand: i % 7 === 0,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.1;
      ctx.fillStyle = '#06120d';
      ctx.fillRect(0, 0, width, height);
      for (const p of particles) {
        spawn(p, width, height);
        p.px = p.x;
        p.py = p.y;
      }
    };

    /* Reduced motion gets one static pass of short strokes and no rAF loop. */
    const drawStatic = () => {
      ctx.fillStyle = '#06120d';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = `rgba(${LEAF[0]}, ${LEAF[1]}, ${LEAF[2]}, 0.12)`;
      ctx.beginPath();
      for (let i = 0; i < 900; i += 1) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const a = angleAt(x * SCALE, y * SCALE, t);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26);
      }
      ctx.stroke();
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const step = () => {
      ctx.fillStyle = TRAIL;
      ctx.fillRect(0, 0, width, height);
      t += TIME_STEP;

      if (pointer.active) {
        bias.x += ((pointer.x / width - 0.5) * 1.6 - bias.x) * 0.04;
        bias.y += ((pointer.y / height - 0.5) * 1 - bias.y) * 0.04;
      } else {
        bias.x += (0 - bias.x) * 0.04;
        bias.y += (0 - bias.y) * 0.04;
      }

      const segments = [[], [], [], [], [], [], [], []];
      for (const p of particles) {
        let angle = angleAt(p.x * SCALE + bias.x, p.y * SCALE + bias.y, t);
        const tone = p.sand ? SAND : LEAF;

        let near = 0;
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < POINTER_RADIUS && d > 0.001) {
            const falloff = d / POINTER_RADIUS;
            /* Swirl around the cursor and drag it inward as it spins. */
            angle += falloff * (1 - falloff * falloff) * 2.4 * (dx * dy >= 0 ? 1 : -1);
            const pull = (1 - falloff) * 0.6;
            p.x += (dx / d) * pull;
            p.y += (dy / d) * pull;
            near = 1 - falloff;
          }
        }

        const speed = p.sand ? SPEED_SAND : SPEED_LEAF;
        p.px = p.x;
        p.py = p.y;
        p.x += Math.cos(angle) * speed;
        p.y += Math.sin(angle) * speed;
        p.life -= 1;

        if (
          p.life <= 0 ||
          p.x < -20 ||
          p.x > width + 20 ||
          p.y < -20 ||
          p.y > height + 20
        ) {
          spawn(p, width, height);
          p.px = p.x;
          p.py = p.y;
          continue;
        }

        const alpha = tone[3] + near * tone[4];
        const bucket = Math.min(BUCKETS - 1, Math.floor((alpha - tone[3]) / (tone[4] / BUCKETS)));
        segments[(p.sand ? BUCKETS : 0) + bucket].push(p.px, p.py, p.x, p.y);
      }

      for (let group = 0; group < 8; group += 1) {
        const list = segments[group];
        if (!list.length) continue;
        const tone = group < BUCKETS ? LEAF : SAND;
        const base = group < BUCKETS ? 0 : BUCKETS;
        const alpha = tone[3] + ((group - base + 0.5) / BUCKETS) * tone[4];
        ctx.strokeStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 4) {
          ctx.moveTo(list[i], list[i + 1]);
          ctx.lineTo(list[i + 2], list[i + 3]);
        }
        ctx.stroke();
      }

      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduced || frame) return;
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onPointerMove = (event) => {
      if (event.pointerType === 'touch') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };
    const onPointerOut = () => {
      pointer.active = false;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    if (reduced) drawStatic();
    else start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) drawStatic();
    });
    ro.observe(canvas);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerOut);
    window.addEventListener('blur', onPointerOut);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerOut);
      window.removeEventListener('blur', onPointerOut);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="ob-flowfield" aria-hidden="true" />;
}

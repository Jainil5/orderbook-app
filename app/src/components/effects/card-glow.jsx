import { useEffect, useRef } from 'react';

/** One delegated pointer listener paints the radial highlight on every
 *  .ob-card at once, instead of a listener per card. Ported from
 *  github.com/Jainil5/orderbook effects/card-glow. */
export function CardGlow() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let current = null;
    let frame = 0;
    let lastX = 0;
    let lastY = 0;

    const apply = (card) => {
      frame = 0;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--ob-glow-x', `${lastX - rect.left}px`);
      card.style.setProperty('--ob-glow-y', `${lastY - rect.top}px`);
      card.classList.add('ob-card-glow');
    };

    const onMove = (event) => {
      if (event.pointerType === 'touch') return;
      const card =
        event.target instanceof Element ? event.target.closest('.ob-card') : null;
      if (current && current !== card) current.classList.remove('ob-card-glow');
      current = card;
      if (!card) return;
      lastX = event.clientX;
      lastY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => apply(card));
    };

    const clear = () => {
      if (current) current.classList.remove('ob-card-glow');
      current = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', clear);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', clear);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

/** Pointer lean for KPI tiles: the handler only writes the two tilt axes and
 *  `data-tilting`, so the transform itself stays in CSS where the
 *  hover and reduced-motion guards already live. */
export function useTilt({ max = 6, lift = 4, scale = 1.015 } = {}) {
  const frame = useRef(0);

  const write = (el, values) => {
    for (const [name, value] of Object.entries(values)) el.style.setProperty(name, value);
  };

  const onPointerMove = (event) => {
    const el = event.currentTarget;
    if (event.pointerType === 'touch') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { clientX, clientY } = event;
    el.dataset.tilting = 'true';
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width - 0.5;
      const py = (clientY - rect.top) / rect.height - 0.5;
      write(el, {
        '--ob-tilt-rx': `${(-py * max).toFixed(2)}deg`,
        '--ob-tilt-ry': `${(px * max).toFixed(2)}deg`,
        '--ob-tilt-lift': `${lift}px`,
        '--ob-tilt-scale': String(scale),
      });
    });
  };

  const onPointerLeave = (event) => {
    const el = event.currentTarget;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    delete el.dataset.tilting;
    write(el, {
      '--ob-tilt-rx': '0deg',
      '--ob-tilt-ry': '0deg',
      '--ob-tilt-lift': '0px',
      '--ob-tilt-scale': '1',
    });
  };

  return { onPointerMove, onPointerLeave };
}

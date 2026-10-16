"use client";
/* eslint-disable @next/next/no-img-element -- the sprite is transient catalogue media. */

import { useEffect, useRef, useState } from "react";

type FlyDetail = { source: DOMRect; image?: string };
const flyEvent = "ecom:fly-to-cart";
function visibleRect(element: HTMLElement | null) { if (!element) return undefined; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth ? rect : undefined; }

/** Decorative feedback only; callers invoke this after the cart mutation succeeds. */
export function flyToCart(action: HTMLElement, image?: string, thumbnail?: HTMLElement | null) { if (typeof window === "undefined") return; window.dispatchEvent(new CustomEvent<FlyDetail>(flyEvent, { detail: { source: visibleRect(thumbnail ?? null) ?? action.getBoundingClientRect(), image } })); }

export function FlyToCart({ target, onArrival }: { target: React.RefObject<HTMLElement | null>; onArrival: () => void }) {
  const [flight, setFlight] = useState<FlyDetail>(); const sprite = useRef<HTMLDivElement>(null);
  useEffect(() => { const start = (event: Event) => setFlight((event as CustomEvent<FlyDetail>).detail); window.addEventListener(flyEvent, start); return () => window.removeEventListener(flyEvent, start); }, []);
  useEffect(() => { if (!flight) return; const destination = target.current?.getBoundingClientRect(); const element = sprite.current; const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; if (reduced || !destination || !element || !flight.source.width || !flight.source.height) { onArrival(); setFlight(undefined); return; } const startX = flight.source.left + flight.source.width / 2 - 20; const startY = flight.source.top + flight.source.height / 2 - 20; const endX = destination.left + destination.width / 2 - 10; const endY = destination.top + destination.height / 2 - 10; const duration = window.matchMedia?.("(max-width: 639px)").matches ? 1000 : 800; const animation = element.animate([{ transform: `translate3d(${startX}px, ${startY}px, 0) scale(1)`, opacity: .96 }, { transform: `translate3d(${(startX + endX) / 2}px, ${Math.min(startY, endY) - 64}px, 0) scale(.7)`, opacity: .82, offset: .56 }, { transform: `translate3d(${endX}px, ${endY}px, 0) scale(.22)`, opacity: 0 }], { duration, easing: "cubic-bezier(.2,.72,.25,1)", fill: "forwards" }); animation.onfinish = () => { onArrival(); setFlight(undefined); }; return () => animation.cancel(); }, [flight, onArrival, target]);
  if (!flight) return null;
  return <div ref={sprite} aria-hidden className="pointer-events-none fixed left-0 top-0 z-40 grid h-10 w-10 overflow-hidden rounded-lg border border-border bg-surface shadow-md">{flight.image ? <img className="h-full w-full object-cover" src={flight.image} alt="" /> : <span className="grid place-items-center text-secondary">◇</span>}</div>;
}

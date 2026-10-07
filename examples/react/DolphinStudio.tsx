// React / Next.js (client component). Works the same with Vue, Svelte or Angular: it is a Web Component.
"use client";
import { useEffect, useRef } from "react";
import { mount, type DolphinConfig } from "@dolphin/studio";

export function DolphinStudio(props: { config: DolphinConfig }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const el = mount(host.current, props.config);
    return () => el.remove();
  }, [props.config]);
  return <div ref={host} />;
}

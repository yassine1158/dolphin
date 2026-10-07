// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
import { DolphinError } from "./errors.js";

/** Meta accepts scheduled posts between 10 minutes and 30 days ahead. */
export const SCHEDULE_MIN_MS = 10 * 60_000;
export const SCHEDULE_MAX_MS = 30 * 86_400_000;

/**
 * One slot per post: `start` day at `time` (HH:MM, local time), then every `everyDays` days.
 */
export function planSchedule(count: number, start: Date, time = "19:00", everyDays = 1): Date[] {
  const [h, m] = time.split(":").map(n => Number.parseInt(n, 10));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * everyDays);
    d.setHours(Number.isFinite(h) ? h! : 19, Number.isFinite(m) ? m! : 0, 0, 0);
    return d;
  });
}

export function assertSchedulable(at: Date, now: Date = new Date()): void {
  const delta = at.getTime() - now.getTime();
  if (!Number.isFinite(delta) || delta < SCHEDULE_MIN_MS || delta > SCHEDULE_MAX_MS) {
    throw new DolphinError("schedule_window", "The date must be between 10 minutes and 30 days from now.");
  }
}

/** `YYYY-MM-DDTHH:MM` in local time, the value format of <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

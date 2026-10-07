// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
export type DolphinErrorCode =
  | "auth"            // invalid or expired key / token
  | "permission"      // valid credentials, missing permission
  | "quota"           // credit exhausted or spend limit reached
  | "rate_limit"
  | "overloaded"
  | "network"
  | "invalid_request"
  | "invalid_output"  // the model answered something that does not match the schema
  | "refusal"
  | "too_long"
  | "schedule_window"
  | "not_configured"
  | "storage_full"    // the browser has no room left for the studio's data
  | "unknown";

export class DolphinError extends Error {
  override readonly name = "DolphinError";
  constructor(readonly code: DolphinErrorCode, message: string, readonly status?: number) {
    super(message);
  }

  toJSON(): { code: DolphinErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export const isDolphinError = (e: unknown): e is DolphinError => e instanceof DolphinError;

/** HTTP status used by the server for each error code. */
export const HTTP_STATUS: Record<DolphinErrorCode, number> = {
  auth: 401,
  permission: 403,
  quota: 402,
  rate_limit: 429,
  overloaded: 503,
  network: 502,
  invalid_request: 400,
  invalid_output: 502,
  refusal: 422,
  too_long: 422,
  schedule_window: 400,
  not_configured: 501,
  storage_full: 507,
  unknown: 500,
};

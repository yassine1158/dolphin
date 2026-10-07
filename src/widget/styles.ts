// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** Shadow DOM styles: isolated from the host site, themed through CSS custom properties. */
export const STYLES = /* css */ `
:host{--d-primary:#0b3f2f;--d-accent:#f3811d;--d-bg:#f5f7f6;--d-surface:#fff;--d-ink:#14211c;--d-muted:#5d6b65;--d-line:#dde5e1;--d-danger:#b42318;--d-ok:#1f7a45;
  --d-radius:14px;--d-font:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Arabic",sans-serif;
  display:block;font:15px/1.5 var(--d-font);color:var(--d-ink);container-type:inline-size}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.wrap{background:var(--d-bg);border:1px solid var(--d-line);border-radius:calc(var(--d-radius) + 4px);padding:20px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
header .mark{width:44px;height:44px;flex:none}
header h2{margin:0;font-size:1.45rem;letter-spacing:-.01em}
header h2 b{color:var(--d-accent)}
header p{margin:0;color:var(--d-muted);font-size:.9rem}
.badge{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:var(--d-accent);border-radius:99px;padding:3px 9px}
header .end{margin-inline-start:auto}
.card{background:var(--d-surface);border:1px solid var(--d-line);border-radius:var(--d-radius);padding:18px;margin-bottom:14px}
.card h3{margin:0 0 12px;font-size:1.05rem;color:var(--d-primary)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
label{display:block;margin-bottom:12px}
label>span{display:block;font-weight:600;font-size:.88rem;margin-bottom:5px}
.help{display:block;font-size:.8rem;color:var(--d-muted);margin:-2px 0 6px}
input,select,textarea{width:100%;font:inherit;color:inherit;background:#fff;border:1.5px solid var(--d-line);border-radius:10px;padding:9px 11px}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid color-mix(in srgb,var(--d-accent) 55%,transparent);outline-offset:1px}
textarea{resize:vertical}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button{font:600 .9rem var(--d-font);border-radius:10px;padding:9px 14px;border:1.5px solid transparent;cursor:pointer;background:color-mix(in srgb,var(--d-primary) 8%,#fff);color:var(--d-primary)}
button:hover{background:color-mix(in srgb,var(--d-primary) 14%,#fff)}
button.primary{background:var(--d-primary);color:#fff}
button.accent{background:var(--d-accent);color:#fff}
button.danger{background:transparent;color:var(--d-danger);border-color:color-mix(in srgb,var(--d-danger) 35%,#fff)}
button.danger[data-armed]{background:var(--d-danger);color:#fff}
button.link{background:none;border:0;padding:4px 0;color:var(--d-muted);text-decoration:underline}
button[disabled]{opacity:.55;cursor:progress}
.check{display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer}
.check input{width:18px;height:18px;accent-color:var(--d-primary)}
.check>span{margin:0;font-size:.92rem}
.state{font-weight:600;font-size:.9rem;margin:0 0 10px}
.state.ok{color:var(--d-ok)}.state.missing{color:#a15c07}
.hint{color:var(--d-muted);font-size:.85rem;margin:2px 0 12px}
.toast{position:sticky;top:8px;z-index:5;margin-bottom:12px;padding:11px 14px;border-radius:10px;font-weight:600;background:var(--d-primary);color:#fff}
.toast.error{background:var(--d-danger)}.toast.success{background:var(--d-ok)}
.lock{max-width:420px;margin:10px auto}
.post{display:grid;grid-template-columns:minmax(200px,300px) minmax(0,1fr);gap:18px;align-items:start}
.post canvas{display:block;width:100%;height:auto;aspect-ratio:1080/1350;border-radius:12px;background:var(--d-line)}
.post .head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
.pill{font-size:.75rem;font-weight:700;border-radius:99px;padding:3px 10px;background:var(--d-line)}
.pill.scheduled,.pill.published{background:color-mix(in srgb,var(--d-ok) 18%,#fff);color:var(--d-ok)}
.pill.failed{background:color-mix(in srgb,var(--d-danger) 15%,#fff);color:var(--d-danger)}
.err{color:var(--d-danger);font-size:.85rem;font-weight:600;margin:0 0 8px}
.empty{color:var(--d-muted)}
@container (max-width:720px){.grid{grid-template-columns:1fr}.post{grid-template-columns:1fr}.post canvas{max-width:320px}}
@media (prefers-reduced-motion:no-preference){button{transition:background .15s}}
`;

export const MARK_SVG = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fd3a0"/><stop offset="1" stop-color="#0b6b4f"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="26" fill="url(#dg)"/><path d="M12 80 C 30 72, 44 84, 60 78 S 82 70, 90 76" fill="none" stroke="#ffa124" stroke-width="4" stroke-linecap="round"/><g fill="#fff"><path d="M28 72 C 26 48, 44 28, 66 26 C 74 25.5, 80 28, 83 32.5 C 86 33.5, 90 34.5, 94 37 C 90 39.5, 85 40, 80 39.5 C 62 39, 45 50, 36 71 Z"/><path d="M45 32 C 46 24, 51 19, 58 16.5 C 55 22, 55 26.5, 57 29.5 Z"/><path d="M55 43 C 55 50, 52 55, 47 58 C 49 52, 50 47, 50 44 Z"/><path d="M32 68 C 27 74, 21 76, 15 75 C 20 72, 24 69, 27 65 Z"/><path d="M33 69 C 35 76, 34 82, 30 87 C 31 81, 30 76, 28 72 Z"/></g><circle cx="78.5" cy="33" r="2.1" fill="#0b5a43"/><g fill="#ffa124"><path d="M82 9 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><circle cx="92" cy="20" r="2"/></g></svg>`;

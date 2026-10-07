// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** <script src="dolphin.lite.js">: proxy mode only (no Claude SDK in the bundle), exposes window.Dolphin. */
import { defineDolphinElement, mount, DolphinStudioElement } from "./widget/element.js";

defineDolphinElement();
(globalThis as { Dolphin?: object }).Dolphin = { mount, defineDolphinElement, DolphinStudioElement };

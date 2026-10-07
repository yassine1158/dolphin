// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Yassine Chaabane. Commercial license: COMMERCIAL-LICENSE.md
/** <script src="dolphin.js">: full build (proxy + direct mode), exposes window.Dolphin. */
import * as Dolphin from "./index.js";

Dolphin.enableDirectMode();
Dolphin.defineDolphinElement();
(globalThis as { Dolphin?: typeof Dolphin }).Dolphin = Dolphin;

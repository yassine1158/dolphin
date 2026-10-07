/** <script src="dolphin.js">: full build (proxy + direct mode), exposes window.Dolphin. */
import * as Dolphin from "./index.js";

Dolphin.enableDirectMode();
Dolphin.defineDolphinElement();
(globalThis as { Dolphin?: typeof Dolphin }).Dolphin = Dolphin;

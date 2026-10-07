/** <script src="dolphin.lite.js">: proxy mode only (no Claude SDK in the bundle), exposes window.Dolphin. */
import { defineDolphinElement, mount, DolphinStudioElement } from "./widget/element.js";

defineDolphinElement();
(globalThis as { Dolphin?: object }).Dolphin = { mount, defineDolphinElement, DolphinStudioElement };

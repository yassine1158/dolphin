import { ClaudeLlm } from "./adapters/llm/claude.js";
import { MetaPagePublisher } from "./adapters/publish/meta.js";
import { DolphinStudioElement } from "./widget/element.js";

/**
 * Lets the widget call Claude and Meta straight from the browser with keys the user types
 * (encrypted on the device). Only for a private admin page: in proxy mode keys stay on your server.
 */
export function enableDirectMode(): void {
  DolphinStudioElement.directFactory = (s, cfg) => ({
    ...(s.claudeKey ? { llm: new ClaudeLlm({ apiKey: s.claudeKey, allowBrowser: true, ...(cfg.model ? { model: cfg.model } : {}) }) } : {}),
    ...(s.metaPageId && s.metaToken
      ? { publisher: new MetaPagePublisher({ pageId: s.metaPageId, accessToken: s.metaToken, ...(cfg.graphVersion ? { graphVersion: cfg.graphVersion } : {}) }) }
      : {}),
  });
}

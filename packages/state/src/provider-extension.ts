import type { ProviderExtension } from "@tethys/bindings";

/**
 * A fixture vendor-extension notification for the registered UI surface.
 */
export const providerExtensionFixture: ProviderExtension = {
  provider_id: "kiro",
  method: "_kiro.dev/mcp/oauth_request",
  request_id: null,
  params: JSON.stringify({
    url: "https://example.test/oauth",
    code: "ABCD-1234",
  }),
};

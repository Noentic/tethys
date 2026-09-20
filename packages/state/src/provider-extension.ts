import type { ProviderExtension } from "@tethys/bindings";

/**
 * A fixture vendor-extension request. Wave 2.5's M1.17 supplies the transport
 * that turns a `_`-prefixed Provider notification into this event; M1.6c ships
 * the contract and the fixture only.
 */
export const providerExtensionFixture: ProviderExtension = {
  provider_id: "kiro",
  method: "_kiro.dev/mcp/oauth_request",
  params: JSON.stringify({
    url: "https://example.test/oauth",
    code: "ABCD-1234",
  }),
};

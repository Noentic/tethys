import { registerProviderSurface } from "@tethys/ui";
import { ProviderExtensionSurface } from "../provider-popover";

/**
 * The only UI registration needed by the extension fixture. Product providers
 * follow this same one-module composition seam; the shared popover stays
 * unaware of their payloads.
 */
export const FIXTURE_PROVIDER_ID = "fixture-provider";
export const FIXTURE_PROVIDER_METHOD = "_fixture.dev/oauth_request";

export function registerFixtureProviderIntegration(): void {
  registerProviderSurface(
    FIXTURE_PROVIDER_ID,
    FIXTURE_PROVIDER_METHOD,
    ProviderExtensionSurface,
  );
}

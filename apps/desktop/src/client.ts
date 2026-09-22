import { createClient } from "@tethys/client";

/**
 * One transport shared by the desktop routes and their loaders. The Inspector
 * route hydrates its session store in a loader, so the client must be the same
 * instance the mounted view uses (D13 route mount).
 */
export const client = createClient();

import { WorkspacesView as FeatureWorkspacesView } from "@tethys/features";

export interface WorkspacesViewProps {
  onNavigate?: (route: string) => void;
}

/**
 * Thin mount (milestone §1.2). The catalog, trust dialog, peek drawer, and
 * their state live in `@tethys/features`; this route only forwards navigation.
 */
export function WorkspacesView({ onNavigate }: WorkspacesViewProps) {
  return <FeatureWorkspacesView onNavigate={onNavigate} />;
}

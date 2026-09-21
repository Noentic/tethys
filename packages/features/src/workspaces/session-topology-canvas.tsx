//! `session-topology-canvas` (DESIGN.md; spec §2). One accessible SVG renders
//! both modes: git-topology (a trunk node plus one branch node per session) and
//! single-node (a non-git folder). Nodes reuse the M1.6c `status-dot` hue+shape
//! rule — awaiting is a ring, never a chunk-local amber element.

import type { Vcs } from "@tethys/bindings";
import { type CatalogSession, sessionStatusKey } from "@tethys/state";
import { cn, getSessionStateInfo, statusMotionClass } from "@tethys/ui";

export interface SessionTopologyCanvasProps {
  sessions: CatalogSession[];
  vcs: Vcs;
  className?: string;
}

interface Node {
  id: string;
  label: string;
  stateKey: string;
  x: number;
  y: number;
}

function nodeStateKey(session: CatalogSession): string {
  return sessionStatusKey(session.status);
}

function nodesFor(sessions: CatalogSession[], hasGit: boolean): Node[] {
  if (!hasGit) {
    return [
      {
        id: "folder",
        label: "Single-session folder",
        stateKey: sessions.length > 0 ? nodeStateKey(sessions[0]) : "idle",
        x: 140,
        y: 60,
      },
    ];
  }
  const nodes: Node[] = [
    { id: "trunk", label: "trunk", stateKey: "idle", x: 36, y: 60 },
  ];
  const count = Math.max(1, sessions.length);
  sessions.forEach((session, index) => {
    const y = count === 1 ? 60 : 24 + (index * 72) / (count - 1);
    nodes.push({
      id: session.id,
      label: session.branchName,
      stateKey: nodeStateKey(session),
      x: 190,
      y,
    });
  });
  return nodes;
}

function summaryFor(nodes: Node[]): string {
  if (nodes.length === 1 && nodes[0].id === "folder") {
    return "Single-session folder";
  }
  const branches = nodes.filter((node) => node.id !== "trunk");
  if (branches.length === 0) {
    return "Trunk · ready for new thread";
  }
  const parts = branches.map((node) => {
    const info = getSessionStateInfo(node.stateKey);
    return `${node.label} ${info.label.toLowerCase()}`;
  });
  return `${branches.length} session${branches.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

/** The shared node mark: a ring when awaiting, a filled disc otherwise. */
function TopologyNode({ node }: { node: Node }) {
  const info = getSessionStateInfo(node.stateKey);
  const ring = info.shape === "ring";
  return (
    <g
      data-testid="topology-node"
      data-shape={info.shape}
      data-state={node.stateKey}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={ring ? 6 : 5}
        fill={ring ? "transparent" : info.colorVar}
        stroke={ring ? info.colorVar : "none"}
        strokeWidth={ring ? 2 : 0}
        className={statusMotionClass(info.motion)}
      />
      <title>{`${node.label}: ${info.label}`}</title>
    </g>
  );
}

export function SessionTopologyCanvas({
  sessions,
  vcs,
  className,
}: SessionTopologyCanvasProps) {
  const hasGit = vcs.kind !== "none";
  const nodes = nodesFor(sessions, hasGit);
  const summary = summaryFor(nodes);
  const trunk = nodes.find((node) => node.id === "trunk");

  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox="0 0 280 120"
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-full w-full", className)}
      data-testid="session-topology-canvas"
    >
      {trunk &&
        nodes
          .filter((node) => node.id !== "trunk")
          .map((node) => (
            <line
              key={`edge-${node.id}`}
              x1={trunk.x}
              y1={trunk.y}
              x2={node.x}
              y2={node.y}
              stroke="var(--tethys-hairline-strong)"
              strokeWidth={1}
            />
          ))}
      {nodes.map((node) => (
        <TopologyNode key={node.id} node={node} />
      ))}
    </svg>
  );
}

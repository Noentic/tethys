import { useQuery } from "@tanstack/react-query";
import { createClient } from "@tethys/client";

const client = createClient();

export function App() {
  const info = useQuery({
    queryKey: ["host-info"],
    queryFn: () => client.hostInfo(),
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => client.health(),
  });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Tethys — S0.0 shell</h1>
      <p>
        Core seam check: this window called <code>host_info</code> over Tauri
        IPC.
      </p>
      <section>
        <h2>host.info</h2>
        <pre>
          {info.isPending
            ? "loading…"
            : JSON.stringify(info.data ?? info.error, null, 2)}
        </pre>
      </section>
      <section>
        <h2>host.health</h2>
        <pre>
          {health.isPending
            ? "loading…"
            : JSON.stringify(health.data ?? health.error, null, 2)}
        </pre>
      </section>
    </main>
  );
}

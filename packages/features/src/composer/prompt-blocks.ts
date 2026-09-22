import type { ContentBlock } from "@tethys/bindings";
import type { PromptPart } from "@tethys/composer";
import type { ComposerAttachment } from "./attachments";

function fileUri(workdir: string, path: string): string {
  const absolute = `${workdir.replaceAll("\\", "/").replace(/\/$/, "")}/${path.replaceAll("\\", "/")}`;
  const uri = new URL("file:///");
  uri.pathname = absolute.startsWith("/") ? absolute : `/${absolute}`;
  return uri.href;
}

export function promptContentBlocks(
  parts: PromptPart[],
  attachments: ComposerAttachment[],
  workdir: string,
): ContentBlock[] {
  const blocks = parts.map(
    (part): ContentBlock =>
      part.kind === "text"
        ? { Text: part.text }
        : {
            ResourceLink: {
              uri: fileUri(workdir, part.path),
              name: part.name,
              mime_type: null,
            },
          },
  );
  blocks.push(...attachments.map((attachment) => attachment.block));
  return blocks;
}

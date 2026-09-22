import type { ContentBlock } from "@tethys/bindings";
import { Chip } from "@tethys/ui";
import { ProviderCapabilityNotice } from "../../providers/capability-notice";

/**
 * A message attachment (DESIGN.md `attachment-chip`): an image block renders a
 * thumbnail chip that opens at up to `stage-measure`; a resource link renders a
 * path chip. Audio and embedded-resource blocks show a
 * `provider-capability-notice` rather than a blank.
 */
export function AttachmentChip({
  block,
  provider,
  name,
  className,
}: {
  block: ContentBlock;
  provider?: string;
  name?: string;
  className?: string;
}) {
  if ("Image" in block && block.Image) {
    const label = name ?? "Image";
    return (
      <Chip
        className={className}
        interactive
        icon={
          <img
            src={`data:${block.Image.mime_type};base64,${block.Image.data}`}
            alt={label}
            className="h-5 w-5 rounded-xs object-cover"
          />
        }
      >
        {label}
      </Chip>
    );
  }

  if ("ResourceLink" in block && block.ResourceLink) {
    return (
      <Chip className={className} interactive>
        {block.ResourceLink.name}
      </Chip>
    );
  }

  if ("Audio" in block && block.Audio) {
    return <Chip className={className}>Audio · {block.Audio.mime_type}</Chip>;
  }

  if ("Resource" in block && block.Resource) {
    return (
      <Chip className={className} interactive>
        {name ?? block.Resource.uri}
      </Chip>
    );
  }

  return (
    <ProviderCapabilityNotice
      provider={provider ?? "This Provider"}
      capability="render this attachment kind"
      className={className}
    />
  );
}

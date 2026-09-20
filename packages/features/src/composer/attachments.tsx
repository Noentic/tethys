//! Composer attachments (`attachment-chip`, spec §4; DESIGN P5).
//!
//! An image is refused at attach time for a Provider that did not declare
//! image prompts, with the one `provider-capability-notice` treatment.

import { Chip } from "@tethys/ui";
import { useState } from "react";
import { ProviderCapabilityNotice } from "../providers/capability-notice";

export interface ComposerAttachment {
  name: string;
  mime: string;
}

/** An image needs declared image support; other files always attach. */
export function canAcceptAttachment(
  imagePrompts: boolean,
  mime: string,
): boolean {
  if (mime.startsWith("image/")) return imagePrompts;
  return true;
}

export function ComposerAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove?: () => void;
}) {
  return (
    <Chip data-testid="attachment-chip" onRemove={onRemove}>
      {attachment.name}
    </Chip>
  );
}

export interface AttachmentPickerProps {
  providerName: string;
  imagePrompts: boolean;
  onAttach: (attachment: ComposerAttachment) => void;
  disabled?: boolean;
}

export function AttachmentPicker({
  providerName,
  imagePrompts,
  onAttach,
  disabled = false,
}: AttachmentPickerProps) {
  const [refused, setRefused] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream";
      if (!canAcceptAttachment(imagePrompts, mime)) {
        setRefused(true);
        continue;
      }
      setRefused(false);
      onAttach({ name: file.name, mime });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="focus-ring inline-flex cursor-pointer items-center rounded-xs px-1 text-label-sm text-(--tethys-text-muted) hover:text-(--tethys-text-primary)">
        Attach
        <input
          type="file"
          multiple
          disabled={disabled}
          className="hidden"
          aria-label="Attach files"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {refused && (
        <ProviderCapabilityNotice
          provider={providerName}
          capability="accept images"
        />
      )}
    </div>
  );
}

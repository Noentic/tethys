//! Composer attachments (`attachment-chip`, spec §4; DESIGN P5).
//!
//! An image is refused at attach time for a Provider that did not declare
//! image prompts, with the one `provider-capability-notice` treatment.

import { Paperclip } from "@nebutra/icons";
import type { ContentBlock } from "@tethys/bindings";
import { Chip } from "@tethys/ui";
import { useRef, useState } from "react";
import { ProviderCapabilityNotice } from "../providers/capability-notice";

export interface ComposerAttachment {
  /** Stable identity for list keys and per-chip removal. */
  id: string;
  name: string;
  mime: string;
  block: ContentBlock;
}

export interface PromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}

/** Refuse content that the provider did not negotiate. */
export function canAcceptAttachment(
  capabilities: PromptCapabilities | boolean,
  mime: string,
): boolean {
  if (typeof capabilities === "boolean") {
    return mime.startsWith("image/") ? capabilities : true;
  }
  if (mime.startsWith("image/")) return capabilities.image;
  if (mime.startsWith("audio/")) return capabilities.audio;
  return capabilities.embeddedContext;
}

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function createAttachment(file: File): Promise<ComposerAttachment> {
  const mime = file.type || "application/octet-stream";
  const data = await base64(file);
  const acp_metadata = JSON.stringify({ name: file.name });
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.size}`;
  if (mime.startsWith("image/")) {
    return {
      id,
      name: file.name,
      mime,
      block: { Image: { mime_type: mime, data, acp_metadata } },
    };
  }
  if (mime.startsWith("audio/")) {
    return {
      id,
      name: file.name,
      mime,
      block: { Audio: { mime_type: mime, data, acp_metadata } },
    };
  }
  return {
    id,
    name: file.name,
    mime,
    block: {
      Resource: {
        uri: `urn:tethys:attachment:${id}`,
        mime_type: mime,
        text: mime.startsWith("text/") ? await file.text() : null,
        blob: mime.startsWith("text/") ? null : data,
        acp_metadata,
      },
    },
  };
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
  capabilities?: PromptCapabilities;
  /** Legacy test/preview prop; production callers pass negotiated capabilities. */
  imagePrompts?: boolean;
  onAttach: (attachment: ComposerAttachment) => void;
  disabled?: boolean;
}

export function AttachmentPicker({
  providerName,
  capabilities = {
    image: false,
    audio: false,
    embeddedContext: true,
  },
  imagePrompts,
  onAttach,
  disabled = false,
}: AttachmentPickerProps) {
  const negotiated =
    imagePrompts === undefined
      ? capabilities
      : { image: imagePrompts, audio: false, embeddedContext: true };
  const [refused, setRefused] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream";
      if (!canAcceptAttachment(negotiated, mime)) {
        setRefused(
          mime.startsWith("image/")
            ? "accept image prompts"
            : mime.startsWith("audio/")
              ? "accept audio prompts"
              : "accept embedded resources",
        );
        continue;
      }
      try {
        onAttach(await createAttachment(file));
        setRefused(null);
      } catch {
        setRefused("read this attachment");
      }
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-label="Attach files"
        title="Attach files"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="focus-ring inline-flex size-8 items-center justify-center rounded-md bg-(--tethys-surface-hover) text-(--tethys-text-muted) hover:text-(--tethys-text-primary) disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Paperclip className="size-4" aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        className="hidden"
        aria-label="Select files"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {refused && (
        <ProviderCapabilityNotice
          provider={providerName}
          capability={refused}
        />
      )}
    </div>
  );
}

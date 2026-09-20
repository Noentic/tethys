//! Minimal ProseMirror node set for the composer.
//!
//! Declared here rather than pulling `@tiptap/starter-kit`: the composer needs
//! only a document, paragraphs, and text, so its dependency surface stays
//! `@tiptap/core` + the chip/suggestion extensions it already uses.

import { mergeAttributes, Node } from "@tiptap/core";

export const DocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

export const ParagraphNode = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },
});

export const TextNode = Node.create({
  name: "text",
  group: "inline",
});

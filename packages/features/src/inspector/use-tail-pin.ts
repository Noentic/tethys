//! Tail-pinning for the streaming transcript (M1.7 U17). The stage follows the
//! tail only while the user is pinned to it; scrolling up unpins and streaming
//! never moves the viewport.

import { useEffect, useRef, useState } from "react";

const TAIL_THRESHOLD_PX = 8;

/** True when a scroll container is within `threshold` of its bottom. */
export function isAtTail(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = TAIL_THRESHOLD_PX,
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

export interface TailPin {
  pinned: boolean;
  newCount: number;
  jumpToLatest: () => void;
  pin: () => void;
  notifyNewEntries: () => void;
}

export function useTailPin(
  containerRef: React.RefObject<HTMLElement | null>,
  entryCount: number,
): TailPin {
  const [pinned, setPinned] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const previousCount = useRef(entryCount);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onScroll = () => {
      const atTail = isAtTail(
        container.scrollTop,
        container.clientHeight,
        container.scrollHeight,
      );
      setPinned(atTail);
      if (atTail) {
        setNewCount(0);
      }
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  useEffect(() => {
    const delta = entryCount - previousCount.current;
    previousCount.current = entryCount;
    if (delta <= 0) {
      return;
    }
    if (!pinned) {
      setNewCount((count) => count + delta);
      return;
    }
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [entryCount, pinned, containerRef]);

  const jumpToLatest = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    setPinned(true);
    setNewCount(0);
  };

  return {
    pinned,
    newCount,
    jumpToLatest,
    pin: () => setPinned(true),
    notifyNewEntries: () => setNewCount((count) => count + 1),
  };
}

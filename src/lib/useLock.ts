"use client";
import { useCallback, useRef, useState } from "react";

/** 비동기 작업을 한 번에 하나만 실행한다. 버튼을 연달아 눌러도 두 번째부터는 무시된다(ref 라서 같은 틱에도 막힘). */
export function useLock() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  return [run, busy] as const;
}

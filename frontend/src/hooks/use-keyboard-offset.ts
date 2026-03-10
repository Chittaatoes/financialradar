import { useState, useEffect } from "react";

export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      const vv = window.visualViewport;
      if (!vv) return;
      const keyboardHeight = window.innerHeight - vv.height;
      setOffset(keyboardHeight > 50 ? keyboardHeight : 0);
    }

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return offset;
}

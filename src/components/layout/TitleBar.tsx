import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  useEffect(() => {
    const el = document.getElementById("titlebar-drag");
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left button only
      if (e.detail === 2) {
        getCurrentWindow().toggleMaximize();
      } else {
        getCurrentWindow().startDragging();
      }
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div
      id="titlebar-drag"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "28px",
        zIndex: 9999,
        pointerEvents: "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "default",
      }}
    />
  );
}

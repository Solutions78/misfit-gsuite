import { create } from "zustand";
import type { DocContent } from "@/types";

interface DocState {
  activeDocId: string | null;
  activeDoc: DocContent | null;
  isDirty: boolean;
  lastSaved: Date | null;
  activeSelection: string;
  pendingFileId: string | null; // set by DriveView to trigger DocsView to open a file
  setActiveDoc: (doc: DocContent) => void;
  setDirty: (dirty: boolean) => void;
  setLastSaved: (date: Date) => void;
  setActiveSelection: (text: string) => void;
  clearDoc: () => void;
  setPendingFileId: (id: string | null) => void;
}

export const useDocStore = create<DocState>((set) => ({
  activeDocId: null,
  activeDoc: null,
  isDirty: false,
  lastSaved: null,
  activeSelection: "",
  pendingFileId: null,
  setActiveDoc: (doc) => set({ activeDoc: doc, activeDocId: doc.docId, isDirty: false }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSaved: (date) => set({ lastSaved: date, isDirty: false }),
  setActiveSelection: (text) => set({ activeSelection: text }),
  clearDoc: () =>
    set({ activeDocId: null, activeDoc: null, isDirty: false, lastSaved: null, activeSelection: "" }),
  setPendingFileId: (id) => set({ pendingFileId: id }),
}));

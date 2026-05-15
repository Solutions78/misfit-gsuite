import { create } from "zustand";
import type { DocContent } from "@/types";

interface DocState {
  activeDocId: string | null;
  activeDoc: DocContent | null;
  isDirty: boolean;
  lastSaved: Date | null;
  activeSelection: string;
  setActiveDoc: (doc: DocContent) => void;
  setDirty: (dirty: boolean) => void;
  setLastSaved: (date: Date) => void;
  setActiveSelection: (text: string) => void;
  clearDoc: () => void;
}

export const useDocStore = create<DocState>((set) => ({
  activeDocId: null,
  activeDoc: null,
  isDirty: false,
  lastSaved: null,
  activeSelection: "",
  setActiveDoc: (doc) => set({ activeDoc: doc, activeDocId: doc.docId, isDirty: false }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSaved: (date) => set({ lastSaved: date, isDirty: false }),
  setActiveSelection: (text) => set({ activeSelection: text }),
  clearDoc: () =>
    set({ activeDocId: null, activeDoc: null, isDirty: false, lastSaved: null, activeSelection: "" }),
}));

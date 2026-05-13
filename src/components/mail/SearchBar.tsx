import { useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export default function SearchBar() {
  const { searchQuery, setSearchQuery } = useUIStore();
  const [focused, setFocused] = useState(false);

  const handleClear = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors bg-gray-50",
        focused ? "border-blue-400 bg-white shadow-sm" : "border-gray-200"
      )}
    >
      <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <input
        type="text"
        className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
        placeholder="Search mail..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {searchQuery && (
        <button onClick={handleClear} className="flex-shrink-0">
          <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
        </button>
      )}
    </div>
  );
}

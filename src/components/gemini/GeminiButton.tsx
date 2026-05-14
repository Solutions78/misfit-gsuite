import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useUIStore } from "@/store/uiStore";

export default function GeminiButton() {
  const geminiOpen    = useUIStore((s) => s.geminiOpen);
  const toggleGemini  = useUIStore((s) => s.toggleGemini);
  const chatPanelOpen = useUIStore((s) => s.chatPanelOpen);

  return (
    <motion.button
      onClick={toggleGemini}
      className="fixed bottom-6 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white hover:shadow-xl transition-shadow"
      style={{ right: chatPanelOpen ? "calc(280px + 24px)" : "24px" }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{ rotate: geminiOpen ? 45 : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      title="Gemini AI Assistant"
    >
      <Sparkles className="w-5 h-5" />
    </motion.button>
  );
}

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { listCalendars, listEvents } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { ChevronLeft, ChevronRight, Plus, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";
import EventModal from "./EventModal";
import type { CalendarEvent } from "@/types";

type ViewMode = "month" | "week" | "day";

export default function CalendarView() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set(["primary"]));
  
  const eventModalOpen = useUIStore((s) => s.eventModalOpen);
  const eventModalData = useUIStore((s) => s.eventModalData);
  const openEventModal = useUIStore((s) => s.openEventModal);
  const closeEventModal = useUIStore((s) => s.closeEventModal);

  const { data: calendars } = useQuery({
    queryKey: ["calendars"],
    queryFn: listCalendars,
    staleTime: 300_000,
  });

  // Compute time range for current view
  const { timeMin, timeMax } = getTimeRange(viewMode, currentDate);

  const { data: allEvents } = useQuery({
    queryKey: ["events", timeMin, timeMax, [...selectedCalendars].join(",")],
    queryFn: async () => {
      const results: CalendarEvent[] = [];
      for (const calId of selectedCalendars) {
        const events = await listEvents({
          calendarId: calId,
          timeMin,
          timeMax,
          maxResults: 500,
        });
        results.push(...events);
      }
      return results;
    },
    enabled: selectedCalendars.size > 0,
    staleTime: 60_000,
  });

  const events = allEvents ?? [];

  const navigate = (direction: 1 | -1) => {
    if (viewMode === "month") setCurrentDate((d) => (direction > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    if (viewMode === "week") setCurrentDate((d) => (direction > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
    if (viewMode === "day") setCurrentDate((d) => (direction > 0 ? addDays(d, 1) : subDays(d, 1)));
  };

  const handleDayClick = (date: Date) => {
    openEventModal(null, date);
  };

  const handleEventClick = (event: CalendarEvent) => {
    openEventModal(event);
  };

  return (
    <div className="flex flex-1 h-full bg-white overflow-hidden">
      {/* Main calendar area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-xl hover:bg-gray-50 transition-all uppercase tracking-tighter"
          >
            Today
          </button>

          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <h2 className="text-sm font-black text-gray-900 flex-1 uppercase tracking-tight ml-2">
            {formatHeader(viewMode, currentDate)}
          </h2>

          {/* View switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === v ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar content */}
        <div className="flex-1 overflow-hidden bg-white">
          {viewMode === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onSlotClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onSlotClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {/* Event modal */}
      {eventModalOpen && (
        <EventModal
          event={eventModalData?.event}
          initialDate={eventModalData?.initialDate ?? null}
          onClose={closeEventModal}
        />
      )}
    </div>
  );
}

function getTimeRange(mode: ViewMode, date: Date) {
  let start: Date, end: Date;
  if (mode === "month") {
    start = startOfWeek(startOfMonth(date));
    end = endOfWeek(endOfMonth(date));
  } else if (mode === "week") {
    start = startOfWeek(date);
    end = endOfWeek(date);
  } else {
    start = startOfDay(date);
    end = endOfDay(date);
  }
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

function formatHeader(mode: ViewMode, date: Date) {
  if (mode === "month") return format(date, "MMMM yyyy");
  if (mode === "week") {
    const ws = startOfWeek(date);
    const we = endOfWeek(date);
    return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
  }
  return format(date, "EEEE, MMMM d, yyyy");
}

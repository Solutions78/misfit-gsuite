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
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);

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
    setNewEventDate(date);
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* Calendar sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-gray-200 flex flex-col py-4 px-3" style={{ paddingTop: "calc(28px + 12px)" }}>
        <button
          onClick={() => { setShowEventModal(true); setEditingEvent(null); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors mb-4"
        >
          <Plus className="w-4 h-4" />
          New event
        </button>

        {/* Calendar list */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">
            My calendars
          </p>
          {calendars?.map((cal) => (
            <label
              key={cal.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCalendars.has(cal.id)}
                onChange={(e) => {
                  const next = new Set(selectedCalendars);
                  if (e.target.checked) next.add(cal.id);
                  else next.delete(cal.id);
                  setSelectedCalendars(next);
                }}
                className="rounded"
                style={{ accentColor: cal.backgroundColor ?? "#2563eb" }}
              />
              <span className="text-sm text-gray-700 truncate">{cal.summary ?? cal.id}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0" style={{ paddingTop: "calc(28px + 8px)" }}>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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

          <h2 className="text-base font-semibold text-gray-900 flex-1">
            {formatHeader(viewMode, currentDate)}
          </h2>

          {/* View switcher */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                  viewMode === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar content */}
        <div className="flex-1 overflow-hidden">
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
      {showEventModal && (
        <EventModal
          event={editingEvent}
          initialDate={newEventDate}
          onClose={() => setShowEventModal(false)}
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

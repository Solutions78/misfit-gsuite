import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function MonthView({ currentDate, events, onDayClick, onEventClick }: Props) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = e.start?.dateTime ? parseISO(e.start.dateTime) : e.start?.date ? parseISO(e.start.date) : null;
      return start && isSameDay(start, day);
    });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 flex-shrink-0">
        {dayNames.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                "border-r border-b border-gray-100 p-1 cursor-pointer hover:bg-gray-50 transition-colors overflow-hidden",
                !inMonth && "bg-gray-50"
              )}
            >
              <div className="flex justify-end mb-1">
                <span
                  className={cn(
                    "w-6 h-6 flex items-center justify-center text-xs rounded-full font-medium",
                    today ? "bg-blue-600 text-white" : inMonth ? "text-gray-900" : "text-gray-400"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    className="w-full text-left px-1.5 py-0.5 rounded text-xs truncate bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                  >
                    {event.summary}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-gray-500 px-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

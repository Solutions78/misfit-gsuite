import {
  format,
  parseISO,
  isSameDay,
  differenceInMinutes,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

const CELL_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function DayView({ currentDate, events, onSlotClick, onEventClick }: Props) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  const dayEvents = events.filter((e) => {
    const start = e.start?.dateTime ? parseISO(e.start.dateTime) : null;
    return start && isSameDay(start, currentDate) && e.start?.dateTime;
  });

  return (
    <div className="h-full flex overflow-y-auto">
      {/* Time labels */}
      <div className="w-16 flex-shrink-0">
        {hours.map((h) => (
          <div
            key={h}
            style={{ height: CELL_HEIGHT }}
            className="flex items-start justify-end pr-3 pt-1"
          >
            <span className="text-xs text-gray-400 tabular-nums">
              {format(new Date().setHours(h, 0, 0, 0), "h a")}
            </span>
          </div>
        ))}
      </div>

      {/* Day column */}
      <div
        className="flex-1 relative border-l border-gray-100"
        style={{ minHeight: `${(END_HOUR - START_HOUR) * CELL_HEIGHT}px` }}
      >
        {hours.map((h) => (
          <div
            key={h}
            style={{ height: CELL_HEIGHT }}
            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            onClick={() => {
              const d = new Date(currentDate);
              d.setHours(h, 0, 0, 0);
              onSlotClick(d);
            }}
          />
        ))}

        {dayEvents.map((event) => {
          const startTime = parseISO(event.start!.dateTime!);
          const endTime = parseISO(event.end!.dateTime!);
          const startMinutes = differenceInMinutes(
            startTime,
            new Date(currentDate).setHours(START_HOUR, 0, 0, 0)
          );
          const duration = differenceInMinutes(endTime, startTime);
          const top = (startMinutes / 60) * CELL_HEIGHT;
          const height = Math.max((duration / 60) * CELL_HEIGHT, 24);

          return (
            <button
              key={event.id}
              onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
              className="absolute left-2 right-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-3 py-1 text-xs overflow-hidden transition-colors z-10 text-left"
              style={{ top, height }}
            >
              <p className="font-semibold truncate">{event.summary}</p>
              <p className="opacity-80">
                {format(startTime, "h:mm")} – {format(endTime, "h:mm a")}
              </p>
              {event.location && (
                <p className="opacity-70 truncate">{event.location}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

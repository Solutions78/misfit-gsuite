import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachHourOfInterval,
  format,
  isToday,
  parseISO,
  isSameDay,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

const CELL_HEIGHT = 48; // px per hour
const START_HOUR = 6;
const END_HOUR = 22;

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function WeekView({ currentDate, events, onSlotClick, onEventClick }: Props) {
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = e.start?.dateTime ? parseISO(e.start.dateTime) : null;
      return start && isSameDay(start, day) && !e.allDay && e.start?.dateTime;
    });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        <div className="w-14 flex-shrink-0" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="flex-1 py-2 text-center border-l border-gray-100 cursor-pointer hover:bg-gray-50"
            onClick={() => onSlotClick(day)}
          >
            <p className="text-xs font-medium text-gray-500 uppercase">{format(day, "EEE")}</p>
            <p
              className={cn(
                "text-lg font-semibold mx-auto w-8 h-8 flex items-center justify-center rounded-full",
                isToday(day) ? "bg-blue-600 text-white" : "text-gray-900"
              )}
            >
              {format(day, "d")}
            </p>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: `${(END_HOUR - START_HOUR) * CELL_HEIGHT}px` }}>
          {/* Time labels */}
          <div className="w-14 flex-shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: CELL_HEIGHT }}
                className="flex items-start justify-end pr-2 pt-1"
              >
                <span className="text-xs text-gray-400 tabular-nums">
                  {format(new Date().setHours(h, 0, 0, 0), "h a")}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const dayStart = startOfDay(day);

            return (
              <div
                key={day.toISOString()}
                className="flex-1 border-l border-gray-100 relative"
                style={{ minHeight: `${(END_HOUR - START_HOUR) * CELL_HEIGHT}px` }}
              >
                {/* Hour lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: CELL_HEIGHT }}
                    className="border-b border-gray-100"
                    onClick={() => {
                      const d = new Date(day);
                      d.setHours(h, 0, 0, 0);
                      onSlotClick(d);
                    }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((event) => {
                  const startTime = parseISO(event.start!.dateTime!);
                  const endTime = parseISO(event.end!.dateTime!);
                  const startMinutes = differenceInMinutes(startTime, new Date(day).setHours(START_HOUR, 0, 0, 0));
                  const duration = differenceInMinutes(endTime, startTime);

                  const top = (startMinutes / 60) * CELL_HEIGHT;
                  const height = Math.max((duration / 60) * CELL_HEIGHT, 20);

                  return (
                    <button
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      className="absolute left-0.5 right-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md px-1.5 py-0.5 text-xs overflow-hidden transition-colors z-10"
                      style={{ top, height }}
                    >
                      <p className="font-medium truncate">{event.summary}</p>
                      <p className="opacity-80 truncate">
                        {format(startTime, "h:mm a")}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

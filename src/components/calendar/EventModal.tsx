import { useState } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEvent, updateEvent, deleteEvent, respondToEvent } from "@/lib/tauri";
import { X, Trash2, Check, Clock, MapPin, Users, Video, Loader2 } from "lucide-react";
import type { CalendarEvent } from "@/types";

interface Props {
  event: CalendarEvent | null;
  initialDate: Date | null;
  onClose: () => void;
}

export default function EventModal({ event, initialDate, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!event;

  const formatDateTimeLocal = (date: Date) =>
    format(date, "yyyy-MM-dd'T'HH:mm");

  const defaultStart = initialDate ?? new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.summary ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startDateTime, setStartDateTime] = useState(
    event?.start?.dateTime ? event.start.dateTime.slice(0, 16) : formatDateTimeLocal(defaultStart)
  );
  const [endDateTime, setEndDateTime] = useState(
    event?.end?.dateTime ? event.end.dateTime.slice(0, 16) : formatDateTimeLocal(defaultEnd)
  );
  const [attendees, setAttendees] = useState(
    event?.attendees?.map((a) => a.email).join(", ") ?? ""
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["events"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createEvent("primary", {
        summary: title,
        description,
        location,
        start: { dateTime: new Date(startDateTime).toISOString() },
        end: { dateTime: new Date(endDateTime).toISOString() },
        attendees: attendees
          ? attendees.split(",").map((e) => ({ email: e.trim() }))
          : undefined,
      }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateEvent("primary", event!.id, {
        summary: title,
        description,
        location,
        start: { dateTime: new Date(startDateTime).toISOString() },
        end: { dateTime: new Date(endDateTime).toISOString() },
      }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent("primary", event!.id),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: "accepted" | "declined" | "tentative") =>
      respondToEvent("primary", event!.id, status),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const handleSave = () => {
    if (!title.trim()) return;
    if (isEditing) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEditing ? "Edit event" : "New event"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          <input
            className="w-full text-lg font-medium text-gray-900 border-0 border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-400 bg-transparent"
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-1">
              <input
                type="datetime-local"
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
              />
              <span className="text-gray-400 text-sm">→</span>
              <input
                type="datetime-local"
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-gray-50"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
            <input
              className="flex-1 text-sm border-0 border-b border-gray-200 pb-1 focus:outline-none focus:border-blue-400 bg-transparent text-gray-800"
              placeholder="Add location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <Users className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
            <input
              className="flex-1 text-sm border-0 border-b border-gray-200 pb-1 focus:outline-none focus:border-blue-400 bg-transparent text-gray-800"
              placeholder="Add guests (comma-separated emails)"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <Video className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
            <textarea
              className="flex-1 text-sm border-0 border-b border-gray-200 pb-1 focus:outline-none focus:border-blue-400 bg-transparent text-gray-800 resize-none"
              placeholder="Add description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* RSVP buttons for existing events */}
          {isEditing && event?.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">RSVP:</span>
              <button
                onClick={() => rsvpMutation.mutate("accepted")}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-gray-900 text-white rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5 hover:bg-black transition-all active:scale-95"
              >
                Accept
              </button>
              <button
                onClick={() => rsvpMutation.mutate("tentative")}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-gray-900 text-white rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5 hover:bg-black transition-all active:scale-95"
              >
                Maybe
              </button>
              <button
                onClick={() => rsvpMutation.mutate("declined")}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-gray-900 text-white rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5 hover:bg-black transition-all active:scale-95"
              >
                Decline
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50">
          {isEditing ? (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 active:scale-95 group"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />}
              {isEditing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

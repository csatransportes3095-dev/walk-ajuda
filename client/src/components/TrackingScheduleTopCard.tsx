import React, { useState } from "react";
import { Calendar, CheckCircle2, ChevronRight } from "lucide-react";
import { formatTrackingScheduleDate, formatTrackingScheduleTime } from "@shared/trackingScheduleCard";
import type { TrackingScheduleEntry } from "@shared/trackingScheduleCard";
import "@/styles/tracking-schedule-top-card.css";

type Props = { appointment: TrackingScheduleEntry | null };

/** An appointment shortcut only: mutations and booking rules stay in /agendar. */
export default function TrackingScheduleTopCard({ appointment }: Props) {
  const [motionEnabled, setMotionEnabled] = useState(true);
  if (!appointment || !['pending', 'confirmed'].includes(appointment.status) ||
      !/^[-_A-Za-z0-9]{32,64}$/.test(appointment.token)) return null;

  const confirmed = appointment.status === 'confirmed';
  const day = formatTrackingScheduleDate(appointment.slotDate);
  const time = formatTrackingScheduleTime(appointment.slotTime);
  const title = confirmed ? 'AGENDAMENTO CONFIRMADO' : 'AGENDAMENTO DISPONÍVEL';
  const action = confirmed ? 'VER AGENDAMENTO' : 'AGENDAR AGORA';

  return (
    <section
      className="h2-schedule-top-card"
      data-state={confirmed ? 'confirmed' : 'pending'}
      data-motion={!confirmed && motionEnabled ? 'on' : 'off'}
      aria-label={confirmed ? 'Agendamento confirmado' : 'Agendamento disponível'}
    >
      <div className="h2-schedule-top-card__heading">
        <span className="h2-schedule-top-card__icon" aria-hidden="true">
          {confirmed ? <CheckCircle2 size={27} /> : <Calendar size={27} />}
        </span>
        <div className="h2-schedule-top-card__copy">
          <p className="h2-schedule-top-card__eyebrow">{confirmed ? 'Seu horário está reservado' : 'Agora você pode agendar'}</p>
          <h2 className="h2-schedule-top-card__title" aria-live="polite">{title}</h2>
        </div>
      </div>
      {confirmed ? (
        <p className="h2-schedule-top-card__description">
          {day && time ? <>Seu atendimento: <strong>{day} às {time}</strong>.</> : 'Seu agendamento foi confirmado. Consulte os detalhes abaixo.'}
        </p>
      ) : (
        <p className="h2-schedule-top-card__description">Toque no botão para escolher a data e o horário da sua foto.</p>
      )}
      {appointment.serviceName && <p className="h2-schedule-top-card__service">{appointment.serviceName}</p>}
      <a className="h2-schedule-top-card__action" href={`/agendar/${appointment.token}`} aria-label={confirmed ? 'Ver detalhes do agendamento confirmado' : 'Agendar agora: escolher data e horário'}>
        <Calendar size={21} aria-hidden="true" />
        <span>{action}</span>
        <ChevronRight size={22} aria-hidden="true" />
      </a>
      {!confirmed && (
        <button type="button" className="h2-schedule-top-card__motion" onClick={() => setMotionEnabled(value => !value)} aria-pressed={!motionEnabled}>
          {motionEnabled ? 'Pausar efeito' : 'Ativar efeito'}
        </button>
      )}
    </section>
  );
}

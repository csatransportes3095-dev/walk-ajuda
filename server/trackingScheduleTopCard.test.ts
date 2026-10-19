import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import TrackingScheduleTopCard from '../client/src/components/TrackingScheduleTopCard';
import { selectTrackingSchedule, formatTrackingScheduleDate, formatTrackingScheduleTime } from '../shared/trackingScheduleCard';
import type { TrackingScheduleEntry } from '../shared/trackingScheduleCard';

const appointment = (values: Partial<TrackingScheduleEntry> = {}): TrackingScheduleEntry => ({
  id: 10, registrationId: 101, subOrderIndex: 0, token: 'a'.repeat(48),
  status: 'pending', serviceName: 'Atendimento de teste', slotDate: null, slotTime: null, ...values,
});
const render = (entry: TrackingScheduleEntry | null) => renderToStaticMarkup(React.createElement(TrackingScheduleTopCard, { appointment: entry }));

describe('Top scheduling shortcut: real appointment and correct order', () => {
  it('selects only the displayed registration, not the newest phone-level appointment', () => {
    expect(selectTrackingSchedule([appointment(), appointment({id:99,registrationId:202})],101)?.id).toBe(10);
  });
  it('does not fall back to service names or missing registration IDs', () => {
    expect(selectTrackingSchedule([appointment({registrationId:undefined})],101)).toBeNull();
    expect(selectTrackingSchedule([appointment({registrationId:202})],101)).toBeNull();
  });
  it('uses the latest version without mutating the query cache', () => {
    const entries = [appointment(), appointment({id:12,token:'b'.repeat(48)}), appointment({id:11})];
    const snapshot = JSON.stringify(entries);
    expect(selectTrackingSchedule(entries,101)?.id).toBe(12);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
  it.each(['completed','cancelled','unknown'])('does not resurrect an old pending token behind a %s record', status => {
    expect(selectTrackingSchedule([appointment(),appointment({id:11,status})],101)).toBeNull();
  });
  it('isolates different suborders under the same registration', () => {
    const entries = [appointment(),appointment({id:12,status:'completed'}),appointment({id:11,subOrderIndex:1,status:'confirmed'})];
    expect(selectTrackingSchedule(entries,101)?.id).toBe(11);
  });
  it.each([0,-1,1.5,NaN])('hides the card for invalid registration %s', id => {
    expect(selectTrackingSchedule([appointment()],id)).toBeNull();
  });
  it('is safe while loading or with no active schedule', () => {
    expect(selectTrackingSchedule(undefined,101)).toBeNull();
    expect(selectTrackingSchedule(null,101)).toBeNull();
    expect(selectTrackingSchedule([],101)).toBeNull();
  });
  it.each(['short','../bad','javascript:alert(1)','a'.repeat(65)])('rejects invalid schedule tokens', token => {
    expect(selectTrackingSchedule([appointment({token})],101)).toBeNull();
    expect(render(appointment({token}))).toBe('');
  });
  it('allows the real URL-safe token alphabet', () => {
    expect(selectTrackingSchedule([appointment({token:'a_B-'.repeat(8)})],101)).not.toBeNull();
  });
});

describe('Top card rendering', () => {
  it('renders a pending appointment with a red-state pulse and a same-tab booking link', () => {
    const html = render(appointment());
    expect(html).toContain('AGENDAMENTO DISPONÍVEL');
    expect(html).toContain('AGENDAR AGORA');
    expect(html).toContain('data-state="pending"');
    expect(html).toContain('data-motion="on"');
    expect(html).toContain('Pausar efeito');
    expect(html).toContain(`href="/agendar/${'a'.repeat(48)}"`);
    expect(html).not.toContain('target="_blank"');
  });
  it('renders a confirmed appointment in a steady green state with the actual date/time', () => {
    const html = render(appointment({status:'confirmed',slotDate:'2026-10-20',slotTime:'16:30:00'}));
    expect(html).toContain('AGENDAMENTO CONFIRMADO');
    expect(html).toContain('VER AGENDAMENTO');
    expect(html).toContain('20/10/2026');
    expect(html).toContain('16:30');
    expect(html).toContain('data-state="confirmed"');
    expect(html).toContain('data-motion="off"');
    expect(html).not.toContain('Pausar efeito');
    expect(html).not.toContain('AGENDAR AGORA');
  });
  it('does not invent missing confirmed date/time', () => {
    const html = render(appointment({status:'confirmed'}));
    expect(html).toContain('Consulte os detalhes');
    expect(html).not.toContain('Invalid Date');
  });
  it.each(['completed','cancelled'])('hides a %s appointment', status => expect(render(appointment({status}))).toBe(''));
  it('hides an absent appointment', () => expect(render(null)).toBe(''));
  it('escapes service names', () => {
    const html = render(appointment({serviceName:'<script>alert(1)</script>'}));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('Calendar day formatting', () => {
  it.each(['2026-10-20','2026-10-20T00:00:00.000Z',new Date('2026-10-20T00:00:00Z')])('preserves the calendar day', value => {
    expect(formatTrackingScheduleDate(value)).toBe('20/10/2026');
  });
  it.each(['2026-02-30','2026-13-01','invalid','',null])('rejects impossible or absent dates', value => expect(formatTrackingScheduleDate(value)).toBeNull());
  it.each(['24:00','12:60','x',null])('rejects impossible or absent times', value => expect(formatTrackingScheduleTime(value)).toBeNull());
  it('accepts midnight without timezone conversion', () => expect(formatTrackingScheduleTime('00:00:00')).toBe('00:00'));
});

describe('Integration remains presentation-only', () => {
  const page = () => fs.readFileSync('client/src/pages/OrderTracking.tsx','utf8');
  it('places the card inside authenticated results and before the status journey', () => {
    const code = page();
    expect(code.indexOf('<TrackingScheduleTopCard ')).toBeGreaterThan(code.indexOf('history.length > 0 && canAccess && latestStatus && latestCfg'));
    expect(code.indexOf('<TrackingScheduleTopCard ')).toBeLessThan(code.indexOf('{/* === JORNADA VERTICAL DO PEDIDO === */}'));
    expect(code.match(/<TrackingScheduleTopCard /g)).toHaveLength(1);
  });
  it('both shortcut and existing details refer to the same selected appointment', () => {
    const code = page();
    expect(code).toContain('selectTrackingSchedule(scheduleQuery.data, registrationId)');
    expect(code).toContain('appointment={currentTrackingSchedule}');
    expect(code).toContain('[currentTrackingSchedule].map');
    expect(code).not.toContain('canShowScheduleForCurrentOrder');
  });
  it('refreshes on focus, reconnection and a change of order/status', () => {
    const code = page();
    expect(code).toContain('refetchInterval: 15000, refetchOnWindowFocus: true, refetchOnReconnect: true');
    expect(code).toContain('[canAccess, searchPhone, registrationId, latestStatus]');
  });
  it('adds registration identity without modifying the existing session validation', () => {
    const router = fs.readFileSync('server/routers/schedule.ts','utf8');
    const endpoint = router.slice(router.indexOf('  listForTrackingByPhone:'),router.indexOf('  // Estado mínimo do agendamento'));
    expect(endpoint).toContain('registrationId: a.registrationId');
    expect(endpoint).toContain('requireCustomerSession(input.cpToken, input.phone)');
    expect(endpoint).toContain('a.status !== "cancelled" && a.status !== "completed"');
  });
  it('uses a scoped slow animation and disables it for reduced motion and confirmation', () => {
    const css = fs.readFileSync('client/src/styles/tracking-schedule-top-card.css','utf8');
    expect(css).toContain('h2-schedule-soft-pulse 2s');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-state="confirmed"]');
    expect(css).toContain('animation: none');
    const component = fs.readFileSync('client/src/components/TrackingScheduleTopCard.tsx','utf8');
    expect(component).not.toMatch(/useMutation|mutateAsync|createAppointment|confirmAppointment/);
  });
});

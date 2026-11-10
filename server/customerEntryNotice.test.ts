import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ last: 0, mail: vi.fn(), now: 1_800_000_000_000 }));
vi.mock('./_core/mailer', () => ({ sendMail: state.mail }));
vi.mock('./db', () => ({ getDb: async () => ({
  execute: async () => [],
  transaction: async (run: any) => {
    let calls = 0;
    return run({ execute: async () => {
      calls++;
      if (calls === 2) return [[{ lastAttemptAt: state.last }]];
      if (calls === 3) state.last = state.now;
      return [];
    }});
  },
}) }));
import { notifyCustomerEntry } from './_core/customerEntryNotification';
beforeEach(() => { state.last = 0; state.mail.mockReset(); state.mail.mockResolvedValue(undefined); });
const send = () => notifyCustomerEntry({phone:'11999999999',name:'Teste',profilePhotoUrl:'https://example.com/photo.jpg',enteredAt:new Date(state.now)});
it('preserves the photo and suppresses repeats until a full 24 hours', async () => {
  await send();
  expect(state.mail).toHaveBeenCalledTimes(1);
  expect(state.mail.mock.calls[0][0].html).toContain('https://example.com/photo.jpg');
  expect(state.mail.mock.calls[0][0].html).toContain('CLIENTE ATIVO NO SITE');
  expect(state.mail.mock.calls[0][0].html).not.toContain('ÁREA ATUAL');
  state.now += 24*60*60*1000-1;
  await send();
  expect(state.mail).toHaveBeenCalledTimes(1);
  state.now++;
  await send();
  expect(state.mail).toHaveBeenCalledTimes(2);
});
it('does not repeatedly retry a failed provider on subsequent logins', async () => {
  state.mail.mockRejectedValue(new Error('quota exceeded'));
  await send(); await send();
  expect(state.mail).toHaveBeenCalledTimes(1);
});

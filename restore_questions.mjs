import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const questions = [
  { id: 1, label: 'Nome Completo', fieldKey: 'fullName', fieldType: 'text', placeholder: 'Seu nome completo', options: null, required: 1, active: 1, sortOrder: 1, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 2, label: 'E-mail', fieldKey: 'email', fieldType: 'email', placeholder: 'seu@email.com', options: null, required: 1, active: 1, sortOrder: 2, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 3, label: 'CPF', fieldKey: 'cpf', fieldType: 'cpf', placeholder: '000.000.000-00', options: null, required: 1, active: 1, sortOrder: 3, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 4, label: 'Quantas contas fake já fez com seu Rosto ?', fieldKey: 'fakeAccountsCount', fieldType: 'number', placeholder: '0', options: null, required: 1, active: 1, sortOrder: 4, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 5, label: 'Qual aparelho de celular você pretende usar?', fieldKey: 'deviceType', fieldType: 'select', placeholder: null, options: 'android,iphone', required: 1, active: 1, sortOrder: 5, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 6, label: 'Óculos com lente transparente é obrigatório. Você aceita essa condição?', fieldKey: 'acceptsGlasses', fieldType: 'radio', placeholder: null, options: 'sim,nao', required: 1, active: 1, sortOrder: 6, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 7, label: 'Foto de perfil com horário agendado. Você aceita essa condição?', fieldKey: 'acceptsScheduledPhoto', fieldType: 'radio', placeholder: null, options: 'sim,nao', required: 1, active: 1, sortOrder: 7, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 8, label: 'Quem te indicou? (Nome)', fieldKey: 'referralName', fieldType: 'text', placeholder: 'Nome de quem te indicou', options: null, required: 0, active: 1, sortOrder: 8, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 9, label: 'Quem te indicou ? (Telefone/WhatsApp)', fieldKey: 'referralPhone', fieldType: 'phone', placeholder: '(00) 00000-0000', options: null, required: 0, active: 1, sortOrder: 9, parentQuestionId: null, triggerOption: null, isSystem: 1 },
  { id: 30002, label: 'WhatsApp Numero que fala com adm', fieldKey: 'phone', fieldType: 'phone', placeholder: '(00) 00000-0000', options: null, required: 1, active: 1, sortOrder: 10, parentQuestionId: null, triggerOption: null, isSystem: 0 },
  { id: 60001, label: 'Qual conta pretende?', fieldKey: 'contaprentende', fieldType: 'text', placeholder: null, options: null, required: 1, active: 1, sortOrder: 11, parentQuestionId: null, triggerOption: null, isSystem: 0 },
];

const now = 1721400000000;

for (const q of questions) {
  try {
    await conn.execute(
      `INSERT INTO preCadastroQuestions (id, label, fieldKey, fieldType, placeholder, options, required, active, sortOrder, parentQuestionId, triggerOption, isSystem, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.id, q.label, q.fieldKey, q.fieldType, q.placeholder, q.options, q.required, q.active, q.sortOrder, q.parentQuestionId, q.triggerOption, q.isSystem, now, now]
    );
    console.log('Inserida:', q.label);
  } catch (e) {
    console.error('Erro em', q.label, ':', e.message);
  }
}

await conn.end();
console.log('Concluído!');

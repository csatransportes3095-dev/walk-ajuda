import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const now = 1721400000000;

const questions = [
  { id: 5, label: 'Qual aparelho de celular você pretende usar?', fieldKey: 'deviceType', fieldType: 'select', placeholder: null, options: JSON.stringify(['android', 'iphone']), required: 1, active: 1, sortOrder: 5, isSystem: 1 },
  { id: 6, label: 'Oculos com lente transparente e obrigatorio. Voce aceita essa condicao?', fieldKey: 'acceptsGlasses', fieldType: 'radio', placeholder: null, options: JSON.stringify(['sim', 'nao']), required: 1, active: 1, sortOrder: 6, isSystem: 1 },
  { id: 7, label: 'Foto de perfil com horario agendado. Voce aceita essa condicao?', fieldKey: 'acceptsScheduledPhoto', fieldType: 'radio', placeholder: null, options: JSON.stringify(['sim', 'nao']), required: 1, active: 1, sortOrder: 7, isSystem: 1 },
];

for (const q of questions) {
  try {
    await conn.execute(
      `INSERT INTO preCadastroQuestions (id, label, fieldKey, fieldType, placeholder, options, required, active, sortOrder, parentQuestionId, triggerOption, isSystem, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      [q.id, q.label, q.fieldKey, q.fieldType, q.placeholder, q.options, q.required, q.active, q.sortOrder, q.isSystem, now, now]
    );
    console.log('OK:', q.label);
  } catch (e) {
    console.error('Erro:', q.label, e.message);
  }
}

await conn.end();
console.log('Pronto!');

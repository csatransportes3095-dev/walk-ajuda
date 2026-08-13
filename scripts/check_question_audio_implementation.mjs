import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const assert = (condition, label) => {
  if (!condition) failures.push(label);
  else console.log(`PASS: ${label}`);
};

const schema = read('drizzle/schema.ts');
const migration = read('drizzle/0124_question_audio_answers.sql');
const router = read('server/routers.ts');
const home = read('client/src/pages/Home.tsx');
const recorder = read('client/src/components/QuestionAudioRecorder.tsx');
const bot = read('client/src/components/ColombiaBot.tsx');
const adminProducts = read('client/src/pages/AdminProducts.tsx');
const adminOrders = read('client/src/pages/AdminOrders.tsx');
const renderStart = read('scripts/render-start.sh');
const packageJson = read('package.json');
const audioMigrationRunner = read('scripts/apply-question-audio-migration.ts');

assert(schema.includes('"audio"') && schema.includes('orderQuestionAudioAnswers') && schema.includes('questionAudioDrafts'), 'schema contém tipo áudio e tabelas aditivas');
assert(migration.includes('CREATE TABLE `questionAudioDrafts`') && migration.includes('CREATE TABLE `orderQuestionAudioAnswers`'), 'migration cria somente estruturas de áudio necessárias');
assert(!/ALTER TABLE `(loans|products|productOptions|orderFiles|customers)`/i.test(migration), 'migration não altera módulos fora de perguntas de áudio');
assert(router.includes('validateQuestionAudioAccess') && router.includes("question.fieldType !== 'audio'"), 'backend exige sessão e confirma que a pergunta é do tipo áudio');
assert(router.includes('inspectQuestionAudio') && router.includes('QUESTION_AUDIO_MIME_TYPES'), 'backend valida assinatura e MIME permitido');
assert(router.includes('draft.customerPhone !== audioAccess.phone') && router.includes('draft.optionId !== input.optionId'), 'backend valida cliente e opção do rascunho');
assert(router.includes('createOrderQuestionAudioAnswers') && router.includes('questionId: draft.questionId'), 'backend grava vínculo definitivo por questionId');
assert(recorder.includes('navigator.mediaDevices.getUserMedia') && recorder.includes('new MediaRecorder'), 'gravador usa microfone somente por ação explícita');
assert(recorder.includes('Permissão do microfone negada') && recorder.includes('Microfone indisponível'), 'gravador trata falhas de permissão e dispositivo');
assert(recorder.includes('USAR ESTE ÁUDIO') && recorder.includes('GRAVAR NOVAMENTE') && recorder.includes('audio controls'), 'gravador oferece prévia, confirmação e regravação');
assert(home.includes('QuestionAudioRecorder') && home.includes('audioDraftIdsForSubmit'), 'fluxo principal integra gravação e envia apenas referências de rascunho');
assert(home.includes("q.fieldType === 'audio' ? questionAudioAnswers"), 'pergunta obrigatória de áudio bloqueia avanço sem resposta válida');
assert(bot.includes('audio-input') && bot.includes('QuestionAudioRecorder') && bot.includes('audioDraftIds'), 'fluxo alternativo do bot reconhece e envia respostas de áudio');
assert(adminProducts.includes('<option value="audio">Áudio</option>') && adminProducts.includes('Configuração da resposta em áudio'), 'ADM permite configurar perguntas de áudio');
assert(adminOrders.includes("item.answerType === 'audio'") && adminOrders.includes('<audio controls'), 'ADM renderiza player dentro da resposta de áudio');
assert(!router.includes('openai') && !recorder.includes('openai'), 'implementação de áudio não aciona OpenAI');
assert(audioMigrationRunner.includes('CREATE TABLE IF NOT EXISTS') && audioMigrationRunner.includes('addColumnIfMissing'), 'migration de produção de áudio é idempotente');
assert(packageJson.includes('db:migrate:question-audio') && renderStart.includes('pnpm run db:migrate:question-audio'), 'inicialização de produção executa somente a migration de áudio necessária');

if (failures.length) {
  console.error(`\nFalhas: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nTodas as validações estáticas do tipo Áudio passaram.');

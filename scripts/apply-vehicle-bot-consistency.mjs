import fs from 'node:fs';

const path = 'client/src/components/ColombiaBot.tsx';
let src = fs.readFileSync(path, 'utf8');

function once(from, to, label) {
  if (!src.includes(from)) throw new Error(`Anchor not found: ${label}`);
  src = src.replace(from, to);
}

once(
  'import { isPersistedOrderResult } from "@shared/orderSubmission";',
  'import { isPersistedOrderResult } from "@shared/orderSubmission";\nimport { getVehicleModels, getVehicleQuestionKind, VEHICLE_BRANDS, VEHICLE_COLORS, VEHICLE_YEARS } from "@shared/vehicleCatalog";',
  'vehicle catalog import',
);

const oldVisible = `  // Retorna perguntas visíveis ordenadas de forma que sub-perguntas aparecem logo após o pai
  const getVisibleQuestions = (questions: ProductQuestion[], answers: Record<number, string>): ProductQuestion[] => {
    const visible = questions.filter(q => {
      if (!q.parentQuestionId) return true;
      const parentAnswer = answers[q.parentQuestionId]?.trim() || "";
      if (!q.triggerOption) return !!parentAnswer;
      return parentAnswer === q.triggerOption;
    });

    // Ordenar: cada sub-pergunta fica logo após seu pai
    const ordered: ProductQuestion[] = [];
    const roots = visible.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder);

    const insertWithChildren = (q: ProductQuestion) => {
      ordered.push(q);
      // Filhos diretos desta pergunta que estão visíveis
      const children = visible
        .filter(c => c.parentQuestionId === q.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      children.forEach(child => insertWithChildren(child));
    };

    roots.forEach(r => insertWithChildren(r));
    return ordered;
  };`;

const newVisible = `  // Retorna perguntas visíveis ordenadas. Para veículo, perguntas legadas de modelo
  // por marca são compactadas em um único passo Marca -> Modelo.
  const getVisibleQuestions = (questions: ProductQuestion[], answers: Record<number, string>): ProductQuestion[] => {
    const visible = questions.filter(q => {
      if (!q.parentQuestionId) return true;
      const parent = questions.find(item => item.id === q.parentQuestionId);
      const parentAnswer = answers[q.parentQuestionId]?.trim() || "";
      if (getVehicleQuestionKind(q.question) === 'model' && parent && getVehicleQuestionKind(parent.question) === 'brand') {
        return !!parentAnswer;
      }
      if (!q.triggerOption) return !!parentAnswer;
      return parentAnswer === q.triggerOption;
    });

    const ordered: ProductQuestion[] = [];
    const roots = visible.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder);

    const insertWithChildren = (q: ProductQuestion) => {
      ordered.push(q);
      const rawChildren = visible
        .filter(c => c.parentQuestionId === q.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const modelChildren = getVehicleQuestionKind(q.question) === 'brand'
        ? rawChildren.filter(child => getVehicleQuestionKind(child.question) === 'model')
        : [];
      const children = modelChildren.length > 0
        ? [modelChildren[0], ...rawChildren.filter(child => getVehicleQuestionKind(child.question) !== 'model')]
        : rawChildren;
      children.forEach(child => insertWithChildren(child));
    };

    roots.forEach(r => insertWithChildren(r));
    return ordered;
  };`;
once(oldVisible, newVisible, 'visible question tree');

const askMarker = `    } else if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = parseOptions(nextQ.options);`;
const askReplacement = `    } else if (getVehicleQuestionKind(nextQ.question)) {
      const kind = getVehicleQuestionKind(nextQ.question);
      const parentAnswer = nextQ.parentQuestionId ? currentAnswers[nextQ.parentQuestionId] || '' : '';
      const opts = kind === 'brand'
        ? VEHICLE_BRANDS
        : kind === 'model'
          ? getVehicleModels(parentAnswer)
          : kind === 'year'
            ? VEHICLE_YEARS
            : VEHICLE_COLORS;

      if (kind === 'model' && opts.length === 0) {
        callbacks.current[msgId] = (val: string) => {
          markAnswered(msgId);
          const normalized = val.toUpperCase();
          addMsgs({ type: "user", id: uid(), text: normalized });
          const newAnswers = { ...currentAnswers, [nextQ.id]: normalized };
          flowState.current.answers = newAnswers;
          saveBotProgress('questions', 'dados');
          setTimeout(() => askQuestions(product, option, newAnswers), 300);
        };
        const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
        addMsgs(
          { type: "bot", id: uid(), text: `${nextQ.question}${parentAnswer ? ` — ${parentAnswer}` : ''}`, questionLevel },
          { type: "input", id: msgId, multiline: false, answered: false, questionLevel }
        );
      } else {
        callbacks.current[msgId] = (val: string) => {
          markAnswered(msgId);
          addMsgs({ type: "user", id: uid(), text: val });
          const newAnswers = { ...currentAnswers };
          if (kind === 'brand') {
            for (const child of option.questions.filter(item => item.parentQuestionId === nextQ.id)) delete newAnswers[child.id];
          }
          newAnswers[nextQ.id] = val;
          flowState.current.answers = newAnswers;
          saveBotProgress('questions', 'dados');
          setTimeout(() => askQuestions(product, option, newAnswers), 300);
        };
        const questionLevel = nextQ.parentQuestionId ? "sub" as const : "principal" as const;
        addMsgs(
          { type: "bot", id: uid(), text: kind === 'model' && parentAnswer ? `MODELO — ${parentAnswer}` : nextQ.question, questionLevel },
          { type: "options", id: msgId, options: opts, answered: false, questionLevel }
        );
      }
    } else if (nextQ.fieldType === "select" && nextQ.options) {
      const opts = parseOptions(nextQ.options);`;
once(askMarker, askReplacement, 'bot vehicle question input');

fs.writeFileSync(path, src, 'utf8');

const testPath = 'server/productVersionVehicleFlow.test.ts';
let test = fs.readFileSync(testPath, 'utf8');
test = test.replace(
  "const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');",
  "const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');\nconst bot = fs.readFileSync('client/src/components/ColombiaBot.tsx', 'utf8');"
);
test = test.replace(
  "    expect(home).toContain(\"VEHICLE_YEARS\");\n  });",
  "    expect(home).toContain(\"VEHICLE_YEARS\");\n    expect(bot).toContain(\"getVehicleModels(parentAnswer)\");\n    expect(bot).toContain(\"modelChildren.length > 0\");\n    expect(bot).toContain(\"VEHICLE_YEARS\");\n  });"
);
fs.writeFileSync(testPath, test, 'utf8');
console.log('Bot vehicle flow unified.');

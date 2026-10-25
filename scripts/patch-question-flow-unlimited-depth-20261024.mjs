import fs from "node:fs";

const adminPath = "client/src/pages/AdminProducts.tsx";
const homePath = "client/src/pages/Home.tsx";
const sentinel = "QUESTION_TREE_UNLIMITED_DEPTH_20261024";

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`[${label}] start marker not found`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`[${label}] end marker not found`);
  return source.slice(0, start) + replacement + source.slice(end);
}

let admin = fs.readFileSync(adminPath, "utf8");
if (!admin.includes(sentinel)) {
  const insertMarker = "  const totalDocs = opt.documents?.length || 0;";
  const insertAt = admin.indexOf(insertMarker);
  if (insertAt < 0) throw new Error("[AdminProducts] totalDocs marker not found");

  const helper = `
  // ${sentinel}
  // Renderiza perguntas condicionais como uma arvore recursiva. Assim qualquer
  // sub-pergunta pode criar filhos e receber as mesmas regras de fluxo.
  const parseConditionalOptions = (question: QuestionType): string[] => {
    if (question.fieldType !== 'select' || !question.options) return [];
    try {
      const parsed = JSON.parse(question.options);
      if (Array.isArray(parsed)) return parsed
        .map((item: any) => typeof item === 'string' ? item : String(item?.label || ''))
        .map((label: string) => label.trim())
        .filter(Boolean);
    } catch {}
    return question.options.split(',').map(label => label.trim()).filter(Boolean);
  };

  const conditionalTreeStyle = (depth: number) => {
    const styles = [
      { color: '#22d3ee', border: 'rgba(34,211,238,.35)', bg: 'rgba(34,211,238,.05)' },
      { color: '#c084fc', border: 'rgba(192,132,252,.35)', bg: 'rgba(192,132,252,.05)' },
      { color: '#34d399', border: 'rgba(52,211,153,.35)', bg: 'rgba(52,211,153,.05)' },
      { color: '#fbbf24', border: 'rgba(251,191,36,.35)', bg: 'rgba(251,191,36,.05)' },
    ];
    return styles[Math.max(0, depth - 1) % styles.length];
  };

  const renderConditionalQuestion = (question: QuestionType, depth: number): React.ReactNode => {
    const options = parseConditionalOptions(question);
    const children = opt.questions
      .filter(child => child.parentQuestionId === question.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const levelStyle = conditionalTreeStyle(depth);
    const indentRem = Math.min(depth * 1.5, 12);
    return (
      <div key={question.id} className="space-y-1" style={{ marginLeft: String(indentRem) + 'rem' }}>
        <div
          className="flex items-center gap-2 border-l-2 px-3 py-1.5 rounded-r-lg"
          style={{ borderColor: levelStyle.border, backgroundColor: levelStyle.bg }}
        >
          <span className="text-[10px] shrink-0" style={{ color: levelStyle.color }}>
            {Array.from({ length: Math.min(depth, 5) }, () => '↳').join('')} se "{question.triggerOption || 'qualquer'}":
          </span>
          <span className="text-xs flex-1 truncate">{question.question}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border" style={{ color: levelStyle.color, borderColor: levelStyle.border }}>
            SUB NÍVEL {depth}
          </span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{question.fieldType}</span>
          {question.isRequired === 1 && <span className="text-[10px] text-red-400">*</span>}
          <button
            onClick={() => startEditingQuestion(question)}
            className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
            title="Editar sub-pergunta"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => { if (confirm('Excluir esta sub-pergunta e revisar os filhos vinculados?')) deleteQMut.mutate({ id: question.id }); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Excluir"><Trash2 className="w-3 h-3" /></button>
        </div>

        {flowEditor(question)}

        {options.length > 0 && (
          <div className="flex flex-wrap gap-1" style={{ marginLeft: '1.5rem' }}>
            {options.map(optionLabel => (
              <button
                key={optionLabel}
                type="button"
                onClick={() => {
                  setNewQParentId(question.id);
                  setNewQTriggerOption(optionLabel);
                  setNewQText('');
                  setNewQType('text');
                  setNewQOptions('');
                  setNewQRequired(true);
                  setNewQPresentation('text');
                  setNewQShowTextWithAudio(false);
                  setNewQPromptAudioFile(null);
                }}
                className="text-[10px] px-2 py-0.5 rounded-full transition-colors border hover:bg-white/10"
                style={{ color: levelStyle.color, borderColor: levelStyle.border, backgroundColor: levelStyle.bg }}
                title={'Adicionar outra sub-pergunta quando a resposta for "' + optionLabel + '"'}
              >
                + sub nível {depth + 1} se &quot;{optionLabel}&quot;
              </button>
            ))}
          </div>
        )}

        {children.map(child => renderConditionalQuestion(child, depth + 1))}
      </div>
    );
  };

`;

  admin = admin.slice(0, insertAt) + helper + admin.slice(insertAt);

  const startMarker = "                    {/* Sub-perguntas indentadas */}";
  const endMarker = "                    </div>\n                  );\n                })}";
  const replacement = `                    {/* Sub-perguntas em profundidade ilimitada */}\n                    {subQs.map(sq => renderConditionalQuestion(sq, 1))}\n`;
  admin = replaceRange(admin, startMarker, endMarker, replacement, "AdminProducts tree");
  fs.writeFileSync(adminPath, admin);
}

let home = fs.readFileSync(homePath, "utf8");
if (!home.includes(sentinel)) {
  const startMarker = "        // Constrói lista ordenada: perguntas raiz em ordem, sub-perguntas logo após o pai";
  const endMarker = "        const flowRules = extractFlowRules(allQsModal);";
  const replacement = `        // ${sentinel}\n        // Monta a arvore em qualquer profundidade. Cada filho so entra quando a\n        // resposta do pai satisfaz triggerOption. As regras finish/message podem\n        // portanto encerrar o questionario em qualquer nivel.\n        const buildOrderedQs = (answers: Record<number, string>): ProductQuestion[] => {\n          const result: ProductQuestion[] = [];\n          const visited = new Set<number>();\n\n          const appendTree = (question: ProductQuestion) => {\n            if (visited.has(question.id)) return;\n            visited.add(question.id);\n            result.push(question);\n\n            const rawChildren = allQsModal\n              .filter(child => child.parentQuestionId === question.id)\n              .sort((a, b) => a.sortOrder - b.sortOrder);\n\n            const vehicleModelChildren = getVehicleQuestionKind(question.question) === 'brand'\n              ? rawChildren.filter(child => getVehicleQuestionKind(child.question) === 'model')\n              : [];\n            const children = vehicleModelChildren.length > 0\n              ? [vehicleModelChildren[0], ...rawChildren.filter(child => getVehicleQuestionKind(child.question) !== 'model')]\n              : rawChildren;\n\n            const parentAnswer = answers[question.id]?.trim() || '';\n            for (const child of children) {\n              const isGenericVehicleModel = getVehicleQuestionKind(question.question) === 'brand'\n                && getVehicleQuestionKind(child.question) === 'model';\n              const isVisible = isGenericVehicleModel\n                ? !!parentAnswer\n                : (!child.triggerOption || parentAnswer === child.triggerOption);\n              if (isVisible) appendTree(child);\n            }\n          };\n\n          allQsModal\n            .filter(question => !question.parentQuestionId)\n            .sort((a, b) => a.sortOrder - b.sortOrder)\n            .forEach(appendTree);\n          return result;\n        };\n\n`;
  home = replaceRange(home, startMarker, endMarker, replacement, "Home question tree");
  fs.writeFileSync(homePath, home);
}

console.log("Unlimited conditional-question depth patch applied.");

// validation-trigger-2

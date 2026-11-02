import type { H2AutoFaqRule, H2AutoPersonalization } from "./h2AutoPersonalization";

/** Textos sugeridos a partir dos fluxos atuais do H2. Editáveis por aparelho.
 *  Inicialmente DESLIGADOS: só enviar após revisão do ADM.
 */
const H2_AUTO_FAQ_BASE_SUGGESTIONS: H2AutoFaqRule[] = [
  { id: "h2_login_cliente", question: "Como faço login no site?", variations: "Quero entrar na minha conta\nComo acesso minha conta?\nNão sei como fazer login", answer: "🔐 *ACESSO AO SITE*\n\nAcesse:\nhttps://h2colombiano.com/login\n\nInforme seu telefone com DDD.\nDepois digite o código de 6 números enviado ao e-mail cadastrado.\n\n✅ O acesso do cliente não usa senha.", enabled: false },
  { id: "h2_ja_sou_cliente", question: "Já sou cliente. Como continuo?", variations: "Sou cliente e quero atendimento\nJá tenho cadastro no H2\nQuero acessar como cliente", answer: "✅ *JÁ SOU CLIENTE*\n\nEscolha *JÁ SOU CLIENTE* no início do H2 AUTO.\n\nInforme o telefone do cadastro com DDD e siga a confirmação por e-mail.\n\n🏠 Digite *MENU* para início.", enabled: false },
  { id: "h2_formato_telefone", question: "Qual telefone devo digitar no cadastro?", variations: "Como escrevo meu número de telefone?\nPosso colocar 55 e DDD?\nMeu telefone está com traços", answer: "📱 *TELEFONE*\n\nInforme seu celular com DDD.\nO sistema reconhece formatos com +55, espaços e traços.\n\nConfira se o número é o mesmo do cadastro.", enabled: false },
  { id: "h2_codigo_nao_chegou", question: "Não recebi o código por e-mail", variations: "Cadê o código que não chegou?\nO código não veio no meu e-mail\nNão está chegando código", answer: "📧 *NÃO RECEBI O CÓDIGO*\n\n1. Confira o e-mail cadastrado e o spam.\n2. Verifique se o cadastro está completo.\n3. Peça outro código quando a opção estiver disponível.\n\nPersistindo o erro, procure *Falar com atendente* no menu.\n\n⚠️ Nunca compartilhe seu código.", enabled: false },
  { id: "h2_codigo_invalido", question: "O código está inválido ou expirou", variations: "Meu código venceu\nCódigo de 6 dígitos não funciona\nNão consigo confirmar o código", answer: "🔢 *CÓDIGO INVÁLIDO*\n\nDigite os 6 números do e-mail mais recente.\nO código tem validade limitada.\n\nSe expirou, solicite outro quando o sistema permitir.\n\n🔙 Digite *0* para voltar.", enabled: false },
  { id: "h2_cadastro_incompleto", question: "Meu cadastro está incompleto. Como resolvo?", variations: "Apareceu atualizar cadastro\nPreciso completar meu cadastro\nCadastro incompleto não chega código", answer: "📝 *ATUALIZAR CADASTRO*\n\nAcesse:\nhttps://h2colombiano.com/login\n\nComplete os dados pendentes e tente confirmar o acesso novamente.\n\nNão envie documentos ou códigos nesta conversa.", enabled: false },
  { id: "h2_telefone_nao_encontrado", question: "O sistema não encontrou meu telefone", variations: "Meu número não está cadastrado\nNão reconhece meu cadastro\nFala que não sou cliente", answer: "📱 *CADASTRO NÃO ENCONTRADO*\n\nConfira DDD e número digitado.\nVerifique se está usando o telefone registrado no H2.\n\nSe seu cadastro estiver incompleto, atualize pelo site.\n\nSe persistir, procure o atendimento.", enabled: false },
  { id: "h2_cadastro_novo", question: "Ainda não sou cliente. Como me cadastro?", variations: "Quero fazer meu primeiro pedido\nComo virar cliente do H2?\nNão tenho cadastro", answer: "🆕 *NOVO CLIENTE*\n\nEscolha *AINDA NÃO SOU CLIENTE* no menu.\n\nInforme o telefone com DDD de quem indicou você.\n\nO cadastro e o pedido podem ser iniciados em:\nhttps://h2colombiano.com/pedidos", enabled: false },
  { id: "h2_telefone_indicador", question: "Qual número eu coloco como indicador?", variations: "Informo meu número ou do indicador?\nQue número de indicação devo colocar?\nQuem me indicou, onde informo?", answer: "👥 *TELEFONE DO INDICADOR*\n\nInforme o celular com DDD da pessoa que indicou você.\n\n⚠️ Não é o seu próprio número.\n\nConfira o telefone antes de continuar.", enabled: false },
  { id: "h2_sem_indicador", question: "E se eu não tiver indicador?", variations: "Não fui indicado por ninguém\nConsigo cadastrar sem indicador?\nNão tenho quem me indique", answer: "🔐 *INDICADOR OBRIGATÓRIO*\n\nPara iniciar como novo cliente, é necessário informar um indicador válido e cadastrado.\n\nSe tiver dúvida, procure *Falar com atendente* no menu.", enabled: false },
  { id: "h2_fazer_pedido", question: "Como faço um pedido novo?", variations: "Quero pedir outro serviço\nOnde faço meu pedido?\nComo comprar pelo site?", answer: "📦 *FAZER PEDIDO*\n\nAcesse:\nhttps://h2colombiano.com/pedidos\n\nEntre com seu cadastro e confira as opções disponíveis antes de confirmar.", enabled: false },
  { id: "h2_acompanhar_pedido", question: "Como acompanho meu pedido?", variations: "Cadê meu pedido?\nComo está o andamento?\nQuero consultar o status do pedido", answer: "📦 *ACOMPANHAR PEDIDO*\n\nAcesse:\nhttps://h2colombiano.com/acompanhar\n\nConfirme seu cadastro para visualizar o status atualizado.\n\nO H2 AUTO não confirma entrega sem consultar o pedido.", enabled: false },
  { id: "h2_pedido_demora", question: "Por que meu pedido está demorando?", variations: "Meu pedido está parado\nAinda não recebi meu pedido\nTem previsão do meu pedido?", answer: "⏳ *ANDAMENTO DO PEDIDO*\n\nVeja o status atualizado em:\nhttps://h2colombiano.com/acompanhar\n\nCaso o prazo informado no seu pedido tenha passado, solicite atendimento.\n\nNão consigo informar um prazo sem consultar seu pedido.", enabled: false },
  { id: "h2_pedido_analise", question: "O que significa pedido em análise?", variations: "Meu pedido está em análise\nA análise foi aprovada?\nO status ficou em análise", answer: "🔎 *PEDIDO EM ANÁLISE*\n\nSeu acompanhamento mostra a etapa registrada no sistema.\n\nConfira as atualizações em:\nhttps://h2colombiano.com/acompanhar\n\nA análise não significa aprovação ou entrega.", enabled: false },
  { id: "h2_pedido_entregue", question: "Como sei se meu pedido foi entregue?", variations: "Meu pedido está pronto?\nJá liberaram meu pedido?\nOnde vejo pedido entregue?", answer: "✅ *CONFERIR ENTREGA*\n\nEntre em:\nhttps://h2colombiano.com/acompanhar\n\nQuando houver entrega, o status e os arquivos disponíveis aparecerão no seu pedido.\n\nNão compartilhe dados de acesso com terceiros.", enabled: false },
  { id: "h2_agendar_foto", question: "Como agendo minha foto?", variations: "Quero marcar horário da foto\nOnde escolho dia da foto?\nPreciso agendar uma foto", answer: "📸 *AGENDAR FOTO*\n\nAcesse seu pedido em:\nhttps://h2colombiano.com/acompanhar\n\nConfira a etapa de foto e as opções de agendamento disponíveis.\n\nRespeite a data e o horário confirmados.", enabled: false },
  { id: "h2_foto_analise", question: "Minha foto foi aprovada?", variations: "A foto está em análise?\nJá analisaram a foto?\nQuero saber o status da foto", answer: "📸 *ANÁLISE DA FOTO*\n\nConfira o status diretamente no pedido:\nhttps://h2colombiano.com/acompanhar\n\nA aprovação só está confirmada quando aparecer no acompanhamento.", enabled: false },
  { id: "h2_reagendar_foto", question: "Posso remarcar minha foto?", variations: "Perdi o horário da foto\nQuero mudar o agendamento\nComo reagendar a foto?", answer: "📅 *REAGENDAMENTO*\n\nAbra seu pedido:\nhttps://h2colombiano.com/acompanhar\n\nVerifique as regras e a disponibilidade para reagendar.\n\nSe não aparecer opção, procure o atendimento.", enabled: false },
  { id: "h2_orientacoes_foto", question: "Onde estão as instruções da foto?", variations: "Como devo me preparar para a foto?\nQuais regras da foto?\nO que levar no agendamento da foto?", answer: "📸 *ORIENTAÇÕES DA FOTO*\n\nConsulte as instruções atualizadas do seu pedido em:\nhttps://h2colombiano.com/acompanhar\n\nSiga apenas as orientações oficiais disponíveis na sua etapa de agendamento.", enabled: false },
  { id: "h2_tabela_valores", question: "Onde vejo a tabela de preços?", variations: "Quanto custa o Uber Carro?\nQuais são os valores?\nQuanto custa cada serviço?", answer: "💰 *TABELA DE VALORES*\n\nPara ver as opções e preços atualizados, escolha *VALORES* no menu ou consulte:\nhttps://h2colombiano.com/pedidos\n\nConfira o total antes de confirmar seu pedido.", enabled: false },
  { id: "h2_valor_taxi", question: "Qual o valor do Uber Táxi?", variations: "Quanto custa Táxi?\nPreço do táxi\nValor do serviço de táxi", answer: "🚕 *VALORES DO TÁXI*\n\nOs preços podem variar conforme a opção escolhida.\n\nConfira a tabela atual no menu *VALORES* ou em:\nhttps://h2colombiano.com/pedidos", enabled: false },
  { id: "h2_formas_pagamento", question: "Como faço o pagamento do pedido?", variations: "Onde pago meu pedido?\nQuais as formas de pagamento?\nQual Pix para pagamento?", answer: "💳 *PAGAMENTO*\n\nConfira os dados e as formas de pagamento informados no seu pedido.\n\n⚠️ Não pague em contas ou chaves enviadas por desconhecidos.\n\nSe houver dúvida, procure o atendimento.", enabled: false },
  { id: "h2_pagamento_pendente", question: "Paguei e meu pedido não atualizou", variations: "Meu pagamento não caiu\nPaguei mas não liberou\nComo confirmo pagamento?", answer: "🧾 *CONFIRMAÇÃO DE PAGAMENTO*\n\nConfira o status no seu pedido:\nhttps://h2colombiano.com/acompanhar\n\nSe o pagamento continuar pendente, peça conferência à equipe pelo atendimento.\n\nNão envie códigos de acesso.", enabled: false },
  { id: "h2_garantia_prazo", question: "Como funciona a garantia?", variations: "Quais são as garantias?\nTem garantia de quantas corridas?\nQual prazo da garantia?", answer: "🛡️ *GARANTIA*\n\nA cobertura depende da garantia escolhida no pedido.\n\nQuando houver limite de tempo e de utilização, vale o que ocorrer primeiro.\n\nConfira as condições registradas no seu pedido.", enabled: false },
  { id: "h2_garantia_inicio", question: "Quando começa minha garantia?", variations: "A garantia começa no pagamento?\nQual é o início da garantia?\nQuando conta o prazo de garantia?", answer: "🛡️ *INÍCIO DA GARANTIA*\n\nA contagem começa após a liberação da conta, conforme a garantia contratada.\n\nConsulte os detalhes no seu pedido.", enabled: false },
  { id: "h2_minhas_indicacoes", question: "Onde vejo minhas indicações?", variations: "Como consultar indicação?\nQuero ver quem indiquei\nMinhas indicações e comissões", answer: "👥 *MINHAS INDICAÇÕES*\n\nNo início do H2 AUTO, escolha *MINHAS INDICAÇÕES*.\n\nInforme o telefone cadastrado e confirme seu acesso por e-mail para consultar os registros.", enabled: false },
  { id: "h2_comissao_saldo", question: "Quanto tenho para receber de comissão?", variations: "Cadê minha comissão?\nMinha indicação já foi paga?\nQuais indicações estão a liberar?", answer: "💰 *COMISSÕES*\n\nConsulte *MINHAS INDICAÇÕES* após confirmar o acesso.\n\nOs registros podem aparecer como *A liberar*, *Liberado* ou *Já pago*.\n\nO valor correto depende das indicações validadas.", enabled: false },
  { id: "h2_comissao_promocao", question: "Indicação de promoção gera comissão?", variations: "Promoção paga comissão?\nTenho comissão em pedido promocional?\nIndicação promocional conta?", answer: "🏷️ *INDICAÇÃO PROMOCIONAL*\n\nPedidos classificados como *PROMOÇÃO* não geram comissão de indicação.\n\nConfira a situação de cada indicação na sua consulta.", enabled: false },
  { id: "h2_emprestimos", question: "Como vejo meus empréstimos?", variations: "Quero consultar minhas parcelas\nOnde vejo empréstimos?\nTenho empréstimo em aberto?", answer: "🏦 *EMPRÉSTIMOS*\n\nAcesse:\nhttps://h2colombiano.com/emprestimo\n\nConfira os valores e vencimentos no seu cadastro.\n\nDados individuais exigem acesso confirmado.", enabled: false },
  { id: "h2_parcela_pendente", question: "Estou com parcela pendente. O que faço?", variations: "Tenho prestação atrasada\nComo regularizo parcela?\nNão consigo fazer novo pedido com parcela aberta", answer: "📋 *PARCELA PENDENTE*\n\nConsulte a situação em:\nhttps://h2colombiano.com/emprestimo\n\nVerifique a pendência e as opções de regularização disponíveis.\n\nPara dúvidas, solicite atendimento.", enabled: false },
  { id: "h2_gastos_corridas", question: "Como faço controle de corridas e gastos?", variations: "Onde vejo meus gastos?\nComo calculo meus lucros?\nTem planilha de corridas?", answer: "📊 *GASTOS E CORRIDAS*\n\nAcesse:\nhttps://h2colombiano.com/gastos\n\nRegistre os gastos e consulte o controle de corridas pelo site.", enabled: false },
  { id: "h2_atendimento_humano", question: "Quero falar com um atendente", variations: "Tem atendimento humano?\nPreciso de atendimento\nQuero falar com uma pessoa", answer: "👨‍💻 *ATENDIMENTO HUMANO*\n\nAbra o menu e escolha *Falar com atendente*.\n\nA seleção da opção correta é feita pelo menu atual.\n\n⚠️ Esta mensagem não encaminha o atendimento sozinha.", enabled: false },
  { id: "h2_horario_atendimento", question: "Qual o horário de atendimento?", variations: "Que horas o suporte atende?\nAtendimento funciona à noite?\nQual o horário do atendente?", answer: "🕒 *HORÁRIO DE ATENDIMENTO*\n\nNossa equipe atende das *11h às 23h*.\n\nO tempo de resposta pode variar.\n\n🏠 *MENU* para início.", enabled: false },
  { id: "h2_atualizar_dados", question: "Como atualizo meu cadastro?", variations: "Quero mudar telefone cadastrado\nPreciso corrigir meu e-mail\nMeus dados estão errados", answer: "📝 *ATUALIZAR DADOS*\n\nAcesse o site:\nhttps://h2colombiano.com/atualizarcadastro\n\nSiga o procedimento de confirmação.\n\nNão compartilhe códigos ou documentos no WhatsApp.", enabled: false },
  { id: "h2_cancelar_pedido", question: "Como peço cancelamento do pedido?", variations: "Quero cancelar meu pedido\nComo solicitar estorno?\nPreciso pedir reembolso", answer: "📦 *CANCELAMENTO*\n\nPara solicitar análise de cancelamento ou reembolso, procure a equipe em *Falar com atendente*.\n\nA aprovação depende das condições do seu pedido; não é automática.", enabled: false },
  { id: "h2_voltar_inicio", question: "Como volto para o início?", variations: "Como voltar uma etapa?\nComo recomeço o atendimento?\nQual comando para voltar?", answer: "🏠 *NAVEGAÇÃO*\n\nDigite *MENU* para voltar ao início.\nDigite *0* para voltar uma etapa.\n\nDurante confirmações de cadastro, siga o aviso mostrado na tela.", enabled: false },
  { id: "h2_video_android", question: "Tem vídeo de ajuda para Android?", variations: "Onde vejo tutorial Android?\nComo acessar instruções Android?\nVídeo de preparação do Android", answer: "📱 *VÍDEO PARA ANDROID*\n\nVeja as orientações disponíveis em:\nhttps://h2colombiano.com/video/hard-android\n\nConfira os requisitos antes de começar.", enabled: false },
  { id: "h2_video_iphone", question: "Tem vídeo de ajuda para iPhone?", variations: "Onde vejo tutorial iPhone?\nComo acessar vídeo para iOS?\nVídeo de preparação do iPhone", answer: "📱 *VÍDEO PARA IPHONE*\n\nVeja as orientações disponíveis em:\nhttps://h2colombiano.com/video/prepara-iphone\n\nConfira os requisitos antes de começar.", enabled: false }
];


/** Subperguntas: uma resposta por assunto, sem consumir vagas com sinônimos. */
const H2_AUTO_FAQ_EXTRA_VARIATIONS: Record<string,string[]> = {
  "h2_login_cliente": [
    "Onde entro no site H2?",
    "Como entrar sem senha?",
    "O login é com telefone?",
    "Tem que digitar senha?",
    "Onde recebo o código de acesso?"
  ],
  "h2_ja_sou_cliente": [
    "Já fiz pedido antes, como entro?",
    "Tenho cadastro, qual opção escolho?",
    "Sou cliente antigo",
    "Como continuar meu atendimento?"
  ],
  "h2_formato_telefone": [
    "Precisa colocar o DDD?",
    "Posso escrever número com parênteses?",
    "Aceita telefone com +55?",
    "Como colocar meu celular corretamente?"
  ],
  "h2_codigo_nao_chegou": [
    "Não recebi o e-mail com código",
    "Já pedi código e não chega",
    "Meu código não chegou",
    "Não está enviando o código",
    "Pedi código faz tempo",
    "Código não aparece no spam",
    "Por que não recebo código?"
  ],
  "h2_codigo_invalido": [
    "Código de confirmação expirado",
    "O código deu erro",
    "Digitei o código e não entrou",
    "Pedi um novo código, qual uso?"
  ],
  "h2_cadastro_incompleto": [
    "Como finalizar meu cadastro?",
    "Meu cadastro está faltando dados",
    "Onde atualizo o cadastro incompleto?",
    "Por que cadastro incompleto não recebe código?"
  ],
  "h2_telefone_nao_encontrado": [
    "Meu telefone não foi localizado",
    "Já tenho cadastro e não encontra",
    "Não reconheceu meu telefone",
    "Por que diz que não tenho cadastro?"
  ],
  "h2_cadastro_novo": [
    "Como ser um novo cliente?",
    "É minha primeira vez no H2",
    "Quero me cadastrar agora",
    "Sou novo, como faço pedido?"
  ],
  "h2_telefone_indicador": [
    "Que telefone informar do indicador?",
    "Preciso informar o número de quem indicou?",
    "O número é meu ou de quem me indicou?",
    "Onde coloco o telefone de quem indicou?",
    "Como informo a pessoa que me indicou?"
  ],
  "h2_sem_indicador": [
    "Posso comprar sem indicação?",
    "Não conheço um indicador",
    "Preciso mesmo ser indicado?",
    "O que faço sem telefone do indicador?"
  ],
  "h2_fazer_pedido": [
    "Como comprar um serviço?",
    "Quero abrir outro pedido",
    "Onde faço um pedido de Uber?",
    "Já sou cliente e quero pedir novamente",
    "Qual o link para pedir?"
  ],
  "h2_acompanhar_pedido": [
    "Como vejo o status do meu pedido?",
    "Quero rastrear meu pedido",
    "Onde aparece meu pedido?",
    "Como acompanhar pelo celular?",
    "Cadê o acompanhamento?"
  ],
  "h2_pedido_demora": [
    "Quanto tempo demora para entregar?",
    "Quanto tempo para entregar a conta?",
    "Qual o prazo de entrega?",
    "Quantos dias para ficar pronto?",
    "Quando vocês entregam?",
    "Demora muito para liberar?",
    "Tem previsão de entrega?",
    "Já paguei, quando vou receber?",
    "Quanto tempo falta para meu pedido?",
    "Que dia meu pedido sai?"
  ],
  "h2_pedido_analise": [
    "Está em análise, o que significa?",
    "Por que meu pedido está em análise?",
    "Quanto tempo fica em análise?",
    "Pedido em análise já está aprovado?"
  ],
  "h2_pedido_entregue": [
    "Meu pedido já está pronto?",
    "Minha conta já foi liberada?",
    "Como sei se a conta foi liberada?",
    "O pedido já está ativo?",
    "Já entregaram minha conta?",
    "Onde está minha entrega?"
  ],
  "h2_agendar_foto": [
    "Como marcar minha foto?",
    "Tem horário para foto?",
    "Onde consigo agendar?",
    "Como escolher data da foto?"
  ],
  "h2_foto_analise": [
    "Qual o resultado da análise da foto?",
    "Minha foto está pendente?",
    "Quando confirmam minha foto?",
    "O status da foto mudou?"
  ],
  "h2_reagendar_foto": [
    "Cheguei atrasado na foto",
    "Não pude comparecer à foto",
    "Como trocar a data agendada?",
    "Tem como mudar o horário da foto?",
    "Quanto tempo para reagendar?"
  ],
  "h2_orientacoes_foto": [
    "Como tirar minha foto?",
    "Quais orientações para foto?",
    "A foto precisa ser deitada?",
    "Onde vejo o procedimento da foto?"
  ],
  "h2_tabela_valores": [
    "Tem tabela de preço?",
    "Quanto custa fazer um pedido?",
    "Preço do Uber Carro",
    "Me passa a tabela de valores",
    "Quais serviços e preços vocês têm?"
  ],
  "h2_valor_taxi": [
    "Quanto custa Uber Táxi?",
    "Tem preço do táxi com nome completo?",
    "Qual tabela do Uber Táxi?",
    "Valor de conta táxi"
  ],
  "h2_formas_pagamento": [
    "Como posso pagar?",
    "Vocês aceitam Pix?",
    "Me manda o pagamento",
    "Tem como fazer pagamento?"
  ],
  "h2_pagamento_pendente": [
    "Já fiz o Pix e não consta",
    "Paguei e ainda aparece pendente",
    "Meu pedido não reconheceu pagamento",
    "Quando confirmam meu pagamento?",
    "Fiz pagamento mas o status não mudou"
  ],
  "h2_garantia_prazo": [
    "Quais garantias vocês têm?",
    "Quanto tempo dura a garantia?",
    "Tem 15 dias ou 50 corridas?",
    "Tem 30 dias ou 100 corridas?",
    "Tem 90 dias ou 300 corridas?",
    "Qual garantia é de 300 corridas?",
    "Vale dias ou corridas primeiro?",
    "O que acontece se completar as corridas antes?"
  ],
  "h2_garantia_inicio": [
    "Quando começa a contar a garantia?",
    "Conta da compra ou da liberação?",
    "Garantia começa após liberar a conta?",
    "Quando passa a valer a garantia?"
  ],
  "h2_minhas_indicacoes": [
    "Como entrar em minhas indicações?",
    "Onde consultar quem indiquei?",
    "Como vejo minhas indicações no WhatsApp?",
    "Quero ver minhas indicações no H2"
  ],
  "h2_comissao_saldo": [
    "Quanto vou receber das indicações?",
    "Quanto de comissão está liberado?",
    "Quanto tenho a liberar?",
    "Como saber se minha comissão foi paga?"
  ],
  "h2_comissao_promocao": [
    "Promoção conta como indicação?",
    "Pedido de promoção gera comissão?",
    "Recebo comissão de promoção?"
  ],
  "h2_emprestimos": [
    "Onde vejo minhas parcelas de empréstimo?",
    "Como saber quanto devo de empréstimo?",
    "Acompanhar empréstimos",
    "Qual é o link de empréstimos?"
  ],
  "h2_parcela_pendente": [
    "Estou devendo uma parcela",
    "Parcela atrasada bloqueia pedido?",
    "Como pagar parcela vencida?"
  ],
  "h2_gastos_corridas": [
    "Como ver meus gastos do motorista?",
    "Tem controle financeiro?",
    "Quero acompanhar minhas corridas",
    "Onde fica planilha de gastos?"
  ],
  "h2_atendimento_humano": [
    "Preciso falar com atendente humano",
    "Não quero falar com robô",
    "Como pedir atendimento de uma pessoa?",
    "Quero suporte humano"
  ],
  "h2_horario_atendimento": [
    "Que horas o atendimento abre?",
    "Até que horas atendem?",
    "Vocês atendem à noite?",
    "Qual o horário de suporte?"
  ],
  "h2_atualizar_dados": [
    "Como corrigir dados cadastrais?",
    "Troquei meu e-mail, como atualizo?",
    "Onde altero meus dados?",
    "Preciso atualizar meu endereço"
  ],
  "h2_cancelar_pedido": [
    "Quero pedir reembolso",
    "Como cancelo a compra?",
    "Quero desistir do pedido",
    "Como solicitar devolução do valor?"
  ],
  "h2_voltar_inicio": [
    "Como voltar ao menu inicial?",
    "O que digito para retornar?",
    "Como retornar uma opção?"
  ],
  "h2_video_android": [
    "Tem vídeo de hard reset Android?",
    "Onde vejo o passo a passo Android?",
    "Preciso do tutorial de Android"
  ],
  "h2_video_iphone": [
    "Tem vídeo para preparar iPhone?",
    "Onde está o tutorial iPhone?",
    "Como vejo as instruções de iPhone"
  ]
};
const H2_AUTO_FAQ_ANSWER_UPDATES: Record<string,string> = {
  "h2_pedido_demora": "⏳ *PRAZO DE ENTREGA*\n\nO prazo depende do serviço e da etapa do pedido.\n\nAcompanhe a previsão e o andamento em:\nhttps://h2colombiano.com/acompanhar\n\nSe o prazo informado no pedido passou, solicite atendimento. Não confirmamos uma data sem consultar o pedido.",
  "h2_garantia_prazo": "🛡️ *GARANTIAS H2 COLOMBIANO*\n\n🥉 *15 dias ou 50 corridas*\n🥈 *30 dias ou 100 corridas*\n🥇 *90 dias ou 300 corridas*\n\nA garantia começa após a liberação da conta e termina quando atingir os dias ou as corridas, *o que ocorrer primeiro*.\n\nConfira as condições do seu pedido."
};
const H2_AUTO_FAQ_NEW_TOPICS: H2AutoFaqRule[] = [
  {
    "id": "h2_preparar_celular",
    "question": "Qual celular preciso usar no procedimento?",
    "variations": "Preciso de chip novo?\nTenho que usar Android novo?\nQual iPhone é compatível?\nPreciso formatar o celular?\nDevo usar WhatsApp novo?\nComo preparar o celular de trabalho?\nQuais requisitos do aparelho?",
    "answer": "📱 *PREPARAÇÃO DO CELULAR*\n\nConfira as orientações do seu pedido e os vídeos oficiais:\n\nAndroid:\nhttps://h2colombiano.com/video/hard-android\n\niPhone:\nhttps://h2colombiano.com/video/prepara-iphone\n\nUse o aparelho indicado para o procedimento.",
    "enabled": false
  },
  {
    "id": "h2_apos_foto_aprovada",
    "question": "Minha foto foi aprovada. O que acontece agora?",
    "variations": "Foto aprovada e agora?\nMinha foto foi aceita, qual o próximo passo?\nDepois de aprovar a foto, o que faço?\nQual o próximo status após foto aprovada?\nJá aprovaram minha foto, quando continua?\nA foto foi aprovada, quando entrega?",
    "answer": "✅ *FOTO APROVADA*\n\nAcompanhe a próxima etapa pelo seu pedido:\nhttps://h2colombiano.com/acompanhar\n\nO status será atualizado conforme o andamento. A foto aprovada não confirma a entrega.",
    "enabled": false
  }
];

function normalizeFaqKey(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}
function faqPhrases(rule: H2AutoFaqRule): string[] {
  return [rule.question,...rule.variations.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)];
}
function mergeFaqPhrases(original: string, candidates: string[], claimed: Set<string>): string {
  const lines=original.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const local=new Set(lines.map(normalizeFaqKey));
  let merged=lines.join("\n");
  for (const phrase of candidates) {
    const key=normalizeFaqKey(phrase);
    if (!key || local.has(key) || claimed.has(key)) continue;
    const next=merged ? merged+"\n"+phrase : phrase;
    if (next.length>600) continue;
    merged=next;
    local.add(key);
    claimed.add(key);
  }
  return merged;
}

/** Quarenta tópicos distintos; subperguntas ficam dentro de variations. */
export const H2_AUTO_FAQ_SUGGESTIONS: H2AutoFaqRule[] = [
  ...H2_AUTO_FAQ_BASE_SUGGESTIONS.map(rule=>({
    ...rule,
    variations:mergeFaqPhrases(rule.variations,H2_AUTO_FAQ_EXTRA_VARIATIONS[rule.id]??[],new Set()),
    answer:H2_AUTO_FAQ_ANSWER_UPDATES[rule.id]??rule.answer,
  })),
  ...H2_AUTO_FAQ_NEW_TOPICS,
];

/** Mescla com o ADM real. Nunca reativa regras, muda respostas editadas ou recria
 *  os tópicos antigos que o administrador excluiu após salvar.
 *  O servidor registra a campanha por aparelho para não reimportar exclusões.
 */
export function mergeH2AutoExpandedFaq(config: H2AutoPersonalization): {
  personalization:H2AutoPersonalization; added:number; augmented:number;
} {
  const seeded=prepareH2AutoCommonFaq(config);
  const list=seeded.personalization.faq.map(rule=>({...rule}));
  const claimed=new Set(list.map(x=>normalizeFaqKey(x.question)));
  let added=seeded.added, augmented=0;
  if (config.faqPresetsLoaded) {
    for (const suggestion of H2_AUTO_FAQ_NEW_TOPICS) {
      if (list.length>=40) break;
      if (list.some(item=>item.id===suggestion.id || faqPhrases(item).some(p=>normalizeFaqKey(p)===normalizeFaqKey(suggestion.question)))) continue;
      list.push({...suggestion});
      faqPhrases(suggestion).forEach(p=>claimed.add(normalizeFaqKey(p)));
      added++;
    }
  }
  for (let i=0;i<list.length;i++) {
    const current=list[i];
    const preset=H2_AUTO_FAQ_SUGGESTIONS.find(p=>p.id===current.id);
    if (!preset) continue; // Nunca edita perguntas manuais.
    const base=H2_AUTO_FAQ_BASE_SUGGESTIONS.find(p=>p.id===current.id);
    const variations=mergeFaqPhrases(current.variations,preset.variations.split(/\r?\n/).filter(Boolean),claimed);
    const answer=base && current.answer===base.answer ? preset.answer : current.answer;
    if (variations!==current.variations || answer!==current.answer) {
      list[i]={...current,variations,answer};
      augmented++;
    }
  }
  return {personalization:{...seeded.personalization,faq:list,faqPresetsLoaded:true},added,augmented};
}

/** Completa sem apagar nada; marca revisão para não recriar itens excluídos após salvar. */
export function prepareH2AutoCommonFaq(config: H2AutoPersonalization): {
  personalization: H2AutoPersonalization; added: number;
} {
  if (config.faqPresetsLoaded) return {personalization:config,added:0};
  const current=[...(config.faq ?? [])];
  const ids=new Set(current.map(f=>f.id));
  const questions=new Set(current.map(f=>f.question.trim().toLocaleLowerCase("pt-BR")));
  let added=0;
  for (const suggestion of H2_AUTO_FAQ_SUGGESTIONS) {
    if (current.length>=40) break;
    if (ids.has(suggestion.id) || questions.has(suggestion.question.trim().toLocaleLowerCase("pt-BR"))) continue;
    current.push({...suggestion});
    ids.add(suggestion.id);
    questions.add(suggestion.question.trim().toLocaleLowerCase("pt-BR"));
    added++;
  }
  return {personalization:{...config,faq:current,faqPresetsLoaded:true},added};
}

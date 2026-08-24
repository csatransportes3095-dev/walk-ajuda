import { createConnection } from "mysql2/promise";
import { gunzipSync } from "node:zlib";

const RECOVERY_ID = "walk-ajuda-loans-2026-07-28";

const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");
const isBlank = (v) => v == null || String(v).trim() === "";

async function q(db, sql, params = []) {
  const [r] = await db.execute(sql, params);
  return Array.isArray(r) ? r : [];
}
async function exists(db, table) {
  const r = await q(db, "SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [table]);
  return Number(r[0]?.cnt || 0) > 0;
}
async function hasCol(db, table, col) {
  if (!(await exists(db, table))) return false;
  return (await q(db, `SHOW COLUMNS FROM \`${table}\` LIKE ?`, [col])).length > 0;
}
async function addCol(db, table, col, def) {
  if (!(await hasCol(db, table, col))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
    console.log(`[loans-recovery] coluna criada ${table}.${col}`);
  }
}
async function ensureSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS loanProfiles (
    id INT NOT NULL AUTO_INCREMENT, name VARCHAR(50) NOT NULL, slug VARCHAR(30) NOT NULL,
    creditLimit DECIMAL(10,2) NOT NULL DEFAULT 500, interestRate DECIMAL(5,2) NOT NULL DEFAULT 5,
    maxDays INT NOT NULL DEFAULT 30, isActive TINYINT(1) NOT NULL DEFAULT 1, sortOrder INT NOT NULL DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    defaultPaymentTypes VARCHAR(80) NOT NULL DEFAULT 'diario', maxDaysSemanal INT NOT NULL DEFAULT 60,
    maxDaysQuinzenal INT NOT NULL DEFAULT 60, maxDaysMensal INT NOT NULL DEFAULT 90,
    PRIMARY KEY(id), UNIQUE KEY slug(slug)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loanClients (
    id INT NOT NULL AUTO_INCREMENT, userId INT NOT NULL, name VARCHAR(150) NOT NULL, cpf VARCHAR(14) NULL,
    phone VARCHAR(20) NULL, status ENUM('ativo','bloqueado','inadimplente') NOT NULL DEFAULT 'ativo',
    profileSlug VARCHAR(30) NOT NULL DEFAULT 'bronze', creditLimit DECIMAL(10,2) NOT NULL DEFAULT 500,
    interestRate DECIMAL(5,2) NOT NULL DEFAULT 5, maxDays INT NOT NULL DEFAULT 30, notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    loanEnabled INT NOT NULL DEFAULT 0, pixKey VARCHAR(200) NULL,
    pixKeyType ENUM('cpf','cnpj','telefone','email','aleatoria') NULL, pixName VARCHAR(150) NULL,
    spreadsheetToken VARCHAR(100) NULL, allowedPaymentTypes VARCHAR(80) DEFAULT 'diario,semanal,mensal',
    late_fee_disabled TINYINT(1) NOT NULL DEFAULT 0, client_pix_key VARCHAR(255) NULL,
    client_pix_name VARCHAR(200) NULL, client_pix_bank VARCHAR(100) NULL,
    maxDaysSemanal INT NOT NULL DEFAULT 60, maxDaysQuinzenal INT NOT NULL DEFAULT 60, maxDaysMensal INT NOT NULL DEFAULT 90,
    PRIMARY KEY(id), KEY idx_userId(userId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loans (
    id INT NOT NULL AUTO_INCREMENT, userId INT NOT NULL, clientId INT NOT NULL, amount DECIMAL(10,2) NOT NULL,
    interestRate DECIMAL(5,2) NOT NULL, days INT NOT NULL,
    paymentType ENUM('diario','semanal','mensal','quinzenal','parcelado') NOT NULL DEFAULT 'mensal',
    interestAmount DECIMAL(10,2) NOT NULL, totalAmount DECIMAL(10,2) NOT NULL, releaseDate DATE NULL,
    dueDate DATE NOT NULL, status ENUM('pendente','aprovado','aguardando_pagamento','em_analise','pago','atrasado','cancelado','reprovado') NOT NULL DEFAULT 'pendente',
    paidAt TIMESTAMP NULL, paidBy VARCHAR(100) NULL, refusedReason TEXT NULL, notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    installments INT NOT NULL DEFAULT 1, proofUrl TEXT NULL, proofSentAt TIMESTAMP NULL, approvedAt TIMESTAMP NULL,
    approvedBy VARCHAR(100) NULL, rejectedAt TIMESTAMP NULL, rejectedBy VARCHAR(100) NULL, rejectedReason TEXT NULL,
    workDays ENUM('seg_sab','seg_dom','custom') NOT NULL DEFAULT 'seg_sab',
    interestOnlyEnabled TINYINT(1) NOT NULL DEFAULT 0, interestOnlyCount INT NOT NULL DEFAULT 0,
    pixSentAt DATETIME NULL, pixSentBy VARCHAR(100) NULL, pixConfirmedDate VARCHAR(10) NULL, pixSendNote TEXT NULL,
    PRIMARY KEY(id), KEY idx_clientId(clientId), KEY idx_status(status), KEY idx_dueDate(dueDate)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loanInstallments (
    id INT NOT NULL AUTO_INCREMENT, loanId INT NOT NULL, installmentNumber INT NOT NULL, dueDate VARCHAR(10) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pendente','em_analise','pago','atrasado','pago_juros','rolled_from_interest_only','aguardando_confirmacao') NOT NULL DEFAULT 'pendente',
    proofUrl TEXT NULL, proofSentAt TIMESTAMP NULL, paidAt TIMESTAMP NULL, paidBy VARCHAR(100) NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    originalAmount DECIMAL(10,2) NULL, feeApplied DECIMAL(10,2) NULL, paidAmount DECIMAL(10,2) NULL, notes TEXT NULL,
    PRIMARY KEY(id), KEY idx_loanId(loanId), KEY idx_due_status(dueDate,status)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loanPixConfig (
    id INT NOT NULL AUTO_INCREMENT, pixKey VARCHAR(200) NOT NULL,
    pixKeyType ENUM('cpf','cnpj','telefone','email','aleatoria') NOT NULL, pixName VARCHAR(150) NOT NULL,
    bankName VARCHAR(100) NULL, isActive INT NOT NULL DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loan_late_fee_config (
    id INT NOT NULL DEFAULT 1, enabled TINYINT(1) NOT NULL DEFAULT 1,
    fee_after_18h DECIMAL(10,2) NOT NULL DEFAULT 10, fee_after_20h DECIMAL(10,2) NOT NULL DEFAULT 10,
    fee_after_midnight_pct DECIMAL(5,2) NOT NULL DEFAULT 50, rules_text TEXT NULL, updated_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY(id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS installmentProofs (
    id INT NOT NULL AUTO_INCREMENT, installmentId INT NOT NULL, loanId INT NOT NULL, clientId INT NOT NULL,
    installmentNumber INT NOT NULL, amountPaid DECIMAL(10,2) NOT NULL, paidAt DATETIME NOT NULL,
    paidBy VARCHAR(100) NOT NULL, observation TEXT NULL, originalFileName VARCHAR(255) NULL,
    fileKey VARCHAR(512) NULL, fileUrl VARCHAR(512) NULL, fileMimeType VARCHAR(100) NULL, fileSizeBytes INT NULL,
    hasProof TINYINT(1) NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id), KEY idx_installmentId(installmentId), KEY idx_loanId(loanId), KEY idx_clientId(clientId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS installmentProofLogs (
    id INT NOT NULL AUTO_INCREMENT, proofId INT NOT NULL, installmentId INT NOT NULL, loanId INT NOT NULL,
    action ENUM('attached','replaced','deleted') NOT NULL, performedBy VARCHAR(100) NOT NULL,
    performedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, previousFileKey VARCHAR(512) NULL,
    previousFileUrl VARCHAR(512) NULL, previousFileName VARCHAR(255) NULL, newFileKey VARCHAR(512) NULL,
    newFileUrl VARCHAR(512) NULL, newFileName VARCHAR(255) NULL, deleteReason TEXT NULL,
    PRIMARY KEY(id), KEY idx_proofId(proofId), KEY idx_installmentId(installmentId), KEY idx_loanId(loanId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loanInstallmentPlans (
    id INT NOT NULL AUTO_INCREMENT, parcelas INT NOT NULL, percentual DECIMAL(10,2) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1, ordem INT NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS loanRecoveryMeta (
    recoveryKey VARCHAR(100) NOT NULL, appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summaryJson TEXT NULL, PRIMARY KEY(recoveryKey)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  if (await exists(db, "spreadsheetClients")) {
    await addCol(db, "spreadsheetClients", "cpf", "VARCHAR(14) NULL");
    await addCol(db, "spreadsheetClients", "preservedExpiresAt", "TIMESTAMP NULL DEFAULT NULL");
  }
  for (const [c,d] of [
    ["loanEnabled","INT NOT NULL DEFAULT 0"],["pixKey","VARCHAR(200) NULL"],["pixKeyType","ENUM('cpf','cnpj','telefone','email','aleatoria') NULL"],
    ["pixName","VARCHAR(150) NULL"],["spreadsheetToken","VARCHAR(100) NULL"],["allowedPaymentTypes","VARCHAR(80) DEFAULT 'diario,semanal,mensal'"],
    ["late_fee_disabled","TINYINT(1) NOT NULL DEFAULT 0"],["client_pix_key","VARCHAR(255) NULL"],["client_pix_name","VARCHAR(200) NULL"],
    ["client_pix_bank","VARCHAR(100) NULL"],["maxDaysSemanal","INT NOT NULL DEFAULT 60"],["maxDaysQuinzenal","INT NOT NULL DEFAULT 60"],
    ["maxDaysMensal","INT NOT NULL DEFAULT 90"]
  ]) await addCol(db,"loanClients",c,d);
  for (const [c,d] of [
    ["installments","INT NOT NULL DEFAULT 1"],["proofUrl","TEXT NULL"],["proofSentAt","TIMESTAMP NULL"],["approvedAt","TIMESTAMP NULL"],
    ["approvedBy","VARCHAR(100) NULL"],["rejectedAt","TIMESTAMP NULL"],["rejectedBy","VARCHAR(100) NULL"],["rejectedReason","TEXT NULL"],
    ["workDays","ENUM('seg_sab','seg_dom','custom') NOT NULL DEFAULT 'seg_sab'"],["interestOnlyEnabled","TINYINT(1) NOT NULL DEFAULT 0"],
    ["interestOnlyCount","INT NOT NULL DEFAULT 0"],["pixSentAt","DATETIME NULL"],["pixSentBy","VARCHAR(100) NULL"],
    ["pixConfirmedDate","VARCHAR(10) NULL"],["pixSendNote","TEXT NULL"]
  ]) await addCol(db,"loans",c,d);

  try {
    await db.query("ALTER TABLE loans MODIFY paymentType ENUM('diario','semanal','mensal','quinzenal','parcelado') NOT NULL DEFAULT 'mensal'");
    await db.query("ALTER TABLE loans MODIFY releaseDate DATE NULL DEFAULT NULL");
  } catch (e) { console.warn("[loans-recovery] enum/data:", e?.message || e); }

  const profiles = [
    ["Bronze","bronze",300,40,30,"diario",60,60,90],
    ["Prata","prata",1000,35,25,"diario",50,50,75],
    ["Ouro","ouro",2000,30,25,"diario,semanal,quinzenal,mensal",7,7,30],
    ["Personalizado","personalizado",150,40,90,"diario",180,180,270],
  ];
  for (const p of profiles) await db.execute(
    `INSERT INTO loanProfiles(name,slug,creditLimit,interestRate,maxDays,defaultPaymentTypes,maxDaysSemanal,maxDaysQuinzenal,maxDaysMensal)
     SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM loanProfiles WHERE slug=? LIMIT 1)`, [...p,p[1]]
  );
  const rules = "Regras de pagamento:\n- Pague sua parcela diária até as 18h para evitar taxas adicionais.\n- Após 18h: taxa adicional de R$ 10,00.\n- Após 20h: taxa adicional de mais R$ 10,00 (acumulada: R$ 20,00).\n- Após 23:59: acréscimo de 100% sobre o valor da parcela.";
  await db.execute(`INSERT INTO loan_late_fee_config(id,enabled,fee_after_18h,fee_after_20h,fee_after_midnight_pct,rules_text,updated_at)
    SELECT 1,1,10,10,100,?,0 WHERE NOT EXISTS(SELECT 1 FROM loan_late_fee_config WHERE id=1)`, [rules]);
  if (Number((await q(db,"SELECT COUNT(*) cnt FROM loanInstallmentPlans"))[0]?.cnt || 0) === 0) {
    for (const [i,p] of [[0,[1,30]],[1,[2,50]],[2,[3,75]],[3,[4,100]],[4,[5,125]],[5,[6,150]],[6,[7,175]],[7,[8,200]],[8,[9,225]]])
      await db.execute("INSERT INTO loanInstallmentPlans(parcelas,percentual,ativo,ordem) VALUES (?,?,1,?)",[p[0],p[1],i]);
  }
}

async function insertRow(db, table, row, cols, keepId = true) {
  const use = cols.filter(c => keepId || c !== "id");
  const [r] = await db.execute(
    `INSERT INTO \`${table}\` (${use.map(c=>`\`${c}\``).join(",")}) VALUES (${use.map(()=>"?").join(",")})`,
    use.map(c=>row[c] ?? null)
  );
  return Number(r?.insertId || row.id || 0);
}
function matchIdentity(src, list) {
  const cpf=onlyDigits(src.cpf), phone=onlyDigits(src.phone);
  return list.find(r => (cpf && cpf===onlyDigits(r.cpf)) || (phone && phone===onlyDigits(r.phone)));
}
async function restore(db, payload) {
  const T=payload.tables || {};
  const S={spreadsheetClientsInserted:0,spreadsheetClientsMerged:0,loanClientsInserted:0,loanClientsMerged:0,loansInserted:0,installmentsInserted:0,proofsInserted:0,proofLogsInserted:0};
  await db.beginTransaction();
  try {
    let sheets=await q(db,"SELECT * FROM spreadsheetClients");
    const sheetIds=new Set(sheets.map(r=>Number(r.id)));
    for (const src of T.spreadsheetClients || []) {
      let x=matchIdentity(src,sheets);
      if (x) {
        const set=[],v=[];
        if(isBlank(x.cpf)&&!isBlank(src.cpf)){set.push("cpf=?");v.push(src.cpf)}
        if(isBlank(x.name)&&!isBlank(src.name)){set.push("name=?");v.push(src.name)}
        if(!x.preservedExpiresAt&&src.preservedExpiresAt){set.push("preservedExpiresAt=?");v.push(src.preservedExpiresAt)}
        if(set.length){v.push(x.id);await db.execute(`UPDATE spreadsheetClients SET ${set.join(",")},updatedAt=NOW() WHERE id=?`,v)}
        S.spreadsheetClientsMerged++; continue;
      }
      const cols=["id","phone","name","status","createdAt","updatedAt","cpf","preservedExpiresAt"];
      const keep=!sheetIds.has(Number(src.id)); const id=await insertRow(db,"spreadsheetClients",src,cols,keep);
      sheetIds.add(id); sheets.push({...src,id}); S.spreadsheetClientsInserted++;
    }

    const clientMap=new Map(); let clients=await q(db,"SELECT * FROM loanClients"); const ids=new Set(clients.map(r=>Number(r.id)));
    for (const src of T.loanClients || []) {
      let x=matchIdentity(src,clients);
      if(x){
        const set=[],v=[];
        for(const f of ["name","cpf","phone","notes","pixKey","pixKeyType","pixName","spreadsheetToken","allowedPaymentTypes","client_pix_key","client_pix_name","client_pix_bank"])
          if(isBlank(x[f])&&!isBlank(src[f])){set.push(`\`${f}\`=?`);v.push(src[f])}
        if(set.length){v.push(x.id);await db.execute(`UPDATE loanClients SET ${set.join(",")},updatedAt=NOW() WHERE id=?`,v)}
        clientMap.set(Number(src.id),Number(x.id)); S.loanClientsMerged++; continue;
      }
      const cols=["id","userId","name","cpf","phone","status","profileSlug","creditLimit","interestRate","maxDays","notes","createdAt","updatedAt","loanEnabled","pixKey","pixKeyType","pixName","spreadsheetToken","allowedPaymentTypes","late_fee_disabled","client_pix_key","client_pix_name","client_pix_bank","maxDaysSemanal","maxDaysQuinzenal","maxDaysMensal"];
      const keep=!ids.has(Number(src.id)); const id=await insertRow(db,"loanClients",src,cols,keep);
      ids.add(id);clients.push({...src,id});clientMap.set(Number(src.id),id);S.loanClientsInserted++;
    }

    if(Number((await q(db,"SELECT COUNT(*) cnt FROM loanPixConfig"))[0]?.cnt||0)===0)
      for(const src of T.loanPixConfig||[]) await insertRow(db,"loanPixConfig",src,["id","pixKey","pixKeyType","pixName","bankName","isActive","createdAt","updatedAt"],true);

    const loanMap=new Map(); let loans=await q(db,"SELECT id,clientId,amount,dueDate,createdAt FROM loans"); const loanIds=new Set(loans.map(r=>Number(r.id)));
    for(const orig of T.loans||[]){
      const clientId=clientMap.get(Number(orig.clientId)); if(!clientId) throw new Error(`cliente do empréstimo ${orig.id} não encontrado`);
      const src={...orig,clientId}; let x=loans.find(r=>Number(r.id)===Number(src.id)&&Number(r.clientId)===clientId);
      if(!x)x=loans.find(r=>Number(r.clientId)===clientId&&Number(r.amount)===Number(src.amount)&&String(r.dueDate).slice(0,10)===String(src.dueDate).slice(0,10)&&String(r.createdAt).slice(0,19)===String(src.createdAt).slice(0,19));
      if(x){loanMap.set(Number(orig.id),Number(x.id));continue}
      const cols=["id","userId","clientId","amount","interestRate","days","paymentType","interestAmount","totalAmount","releaseDate","dueDate","status","paidAt","paidBy","refusedReason","notes","createdAt","updatedAt","installments","proofUrl","proofSentAt","approvedAt","approvedBy","rejectedAt","rejectedBy","rejectedReason","workDays","interestOnlyEnabled","interestOnlyCount"];
      const keep=!loanIds.has(Number(src.id)); const id=await insertRow(db,"loans",src,cols,keep);
      loanIds.add(id);loans.push({...src,id});loanMap.set(Number(orig.id),id);S.loansInserted++;
    }

    const instMap=new Map(); let inst=await q(db,"SELECT id,loanId,installmentNumber,dueDate FROM loanInstallments"); const instIds=new Set(inst.map(r=>Number(r.id)));
    for(const orig of T.loanInstallments||[]){
      const loanId=loanMap.get(Number(orig.loanId)); if(!loanId) throw new Error(`empréstimo da parcela ${orig.id} não encontrado`);
      const src={...orig,loanId}; let x=inst.find(r=>Number(r.loanId)===loanId&&Number(r.installmentNumber)===Number(src.installmentNumber)&&String(r.dueDate)===String(src.dueDate));
      if(x){instMap.set(Number(orig.id),Number(x.id));continue}
      const cols=["id","loanId","installmentNumber","dueDate","amount","status","proofUrl","proofSentAt","paidAt","paidBy","createdAt","updatedAt","originalAmount","feeApplied","paidAmount","notes"];
      const keep=!instIds.has(Number(src.id)); const id=await insertRow(db,"loanInstallments",src,cols,keep);
      instIds.add(id);inst.push({...src,id});instMap.set(Number(orig.id),id);S.installmentsInserted++;
    }

    const proofMap=new Map(); let proofs=await q(db,"SELECT id,installmentId,loanId,createdAt FROM installmentProofs"); const proofIds=new Set(proofs.map(r=>Number(r.id)));
    for(const orig of T.installmentProofs||[]){
      const installmentId=instMap.get(Number(orig.installmentId)),loanId=loanMap.get(Number(orig.loanId)),clientId=clientMap.get(Number(orig.clientId));
      if(!installmentId||!loanId||!clientId)continue; const src={...orig,installmentId,loanId,clientId};
      let x=proofs.find(r=>Number(r.installmentId)===installmentId&&Number(r.loanId)===loanId&&String(r.createdAt).slice(0,19)===String(src.createdAt).slice(0,19));
      if(x){proofMap.set(Number(orig.id),Number(x.id));continue}
      const cols=["id","installmentId","loanId","clientId","installmentNumber","amountPaid","paidAt","paidBy","observation","originalFileName","fileKey","fileUrl","fileMimeType","fileSizeBytes","hasProof","createdAt","updatedAt"];
      const keep=!proofIds.has(Number(src.id)); const id=await insertRow(db,"installmentProofs",src,cols,keep);
      proofIds.add(id);proofs.push({...src,id});proofMap.set(Number(orig.id),id);S.proofsInserted++;
    }

    let logs=await q(db,"SELECT id,proofId,installmentId,loanId,performedAt,action FROM installmentProofLogs"); const logIds=new Set(logs.map(r=>Number(r.id)));
    for(const orig of T.installmentProofLogs||[]){
      const proofId=proofMap.get(Number(orig.proofId)),installmentId=instMap.get(Number(orig.installmentId)),loanId=loanMap.get(Number(orig.loanId));
      if(!proofId||!installmentId||!loanId)continue; const src={...orig,proofId,installmentId,loanId};
      if(logs.some(r=>Number(r.proofId)===proofId&&Number(r.installmentId)===installmentId&&String(r.action)===String(src.action)&&String(r.performedAt).slice(0,19)===String(src.performedAt).slice(0,19)))continue;
      const cols=["id","proofId","installmentId","loanId","action","performedBy","performedAt","previousFileKey","previousFileUrl","previousFileName","newFileKey","newFileUrl","newFileName","deleteReason"];
      const keep=!logIds.has(Number(src.id)); const id=await insertRow(db,"installmentProofLogs",src,cols,keep);
      logIds.add(id);logs.push({...src,id});S.proofLogsInserted++;
    }
    await db.execute("INSERT INTO loanRecoveryMeta(recoveryKey,summaryJson) VALUES (?,?)",[RECOVERY_ID,JSON.stringify(S)]);
    await db.commit(); return S;
  } catch(e){await db.rollback();throw e}
}
async function run(){
  if(!process.env.DATABASE_URL){console.log("[loans-recovery] DATABASE_URL ausente");return}
  const db=await createConnection(process.env.DATABASE_URL);
  try{
    await ensureSchema(db);
    const done=await q(db,"SELECT summaryJson FROM loanRecoveryMeta WHERE recoveryKey=? LIMIT 1",[RECOVERY_ID]);
    if(done.length){console.log("[loans-recovery] restauração já aplicada",done[0].summaryJson||"");return}
    const b64=String(process.env.LOAN_RESTORE_PAYLOAD_B64||"").trim();
    if(!b64){console.log("[loans-recovery] estrutura pronta; aguardando LOAN_RESTORE_PAYLOAD_B64");return}
    const payload=JSON.parse(gunzipSync(Buffer.from(b64,"base64")).toString("utf8"));
    if(payload.recoveryId!==RECOVERY_ID)throw new Error("pacote de recuperação inválido");
    console.log("[loans-recovery] restauração concluída",JSON.stringify(await restore(db,payload)));
  }catch(e){console.error("[loans-recovery] falha:",e?.message||e);process.exitCode=1}
  finally{await db.end()}
}
void run();

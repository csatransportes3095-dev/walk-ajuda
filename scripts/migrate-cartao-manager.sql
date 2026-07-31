-- Migração dos dados do cartao-manager para as tabelas cc_* do h2colombiano
-- Execute este script no banco de dados do h2colombiano APÓS criar as tabelas

-- Desabilitar verificações de FK temporariamente
SET FOREIGN_KEY_CHECKS = 0;

-- ── Usuários ──────────────────────────────────────────────────────────────────
-- (dados do dump original — senhas bcrypt preservadas)
INSERT IGNORE INTO cc_app_users (id, phone, passwordHash, name, createdAt, updatedAt)
SELECT id, phone, passwordHash, name, createdAt, updatedAt FROM app_users;

-- ── Categorias ────────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_categorias (id, userId, nome, icone, cor, createdAt)
SELECT id, userId, nome, icone, cor, createdAt FROM categorias;

-- ── Cartões ───────────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_cartoes (id, userId, nome, vencimentoDia, fechamentoDia, limiteTotal, corCartao, createdAt, updatedAt)
SELECT id, userId, nome, vencimentoDia, fechamentoDia, limiteTotal, corCartao, createdAt, updatedAt FROM cartoes;

-- ── Parcelamentos ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_parcelamentos (id, cartaoId, descricao, valorTotal, valorParcela, numParcelas, dataInicio, responsavel, createdAt)
SELECT id, cartaoId, descricao, valorTotal, valorParcela, numParcelas, dataInicio, responsavel, createdAt FROM parcelamentos;

-- ── Gastos ────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_gastos (id, cartaoId, descricao, valor, data, parcelamentoId, numeroParcela, totalParcelas, dataOriginal, paga, responsavel, categoriaId, createdAt)
SELECT id, cartaoId, descricao, valor, data, parcelamentoId, numeroParcela, totalParcelas, dataOriginal, paga, responsavel, categoriaId, createdAt FROM gastos;

-- ── Pagamentos ────────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_pagamentos (id, cartaoId, valorPago, dataPagamento, observacao, createdAt)
SELECT id, cartaoId, valorPago, dataPagamento, observacao, createdAt FROM pagamentos;

-- ── Despesas ──────────────────────────────────────────────────────────────────
INSERT IGNORE INTO cc_despesas (id, userId, nome, categoriaId, valor, diaVencimento, ativa, createdAt, updatedAt)
SELECT id, userId, nome, categoriaId, valor, diaVencimento, ativa, createdAt, updatedAt FROM despesas;

-- ── Pagamentos de Despesas ────────────────────────────────────────────────────
INSERT IGNORE INTO cc_pagamentos_despesas (id, despesaId, userId, mes, ano, valorPago, dataPagamento, createdAt)
SELECT id, despesaId, userId, mes, ano, valorPago, dataPagamento, createdAt FROM pagamentos_despesas;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migração concluída!' as status;

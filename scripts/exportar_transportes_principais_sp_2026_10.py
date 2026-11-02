#!/usr/bin/env python3
"""Extrai todos os estabelecimentos ATIVOS de SP com CNAE PRINCIPAL de ônibus ou carga na base 2026-10.
Fonte primária: Dados Abertos da Receita Federal.
Transporte: espelho Parquet público, convertido sem alterar dados pelo cnpjaberto (Hugging Face).
A exportação é independente do site H2 Colombiano e não altera qualquer banco de dados.
"""
import csv
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

import duckdb
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

CNAES = ("4921301", "4921302", "4922101", "4922102", "4922103", "4929901", "4929902", "4930201", "4930202", "4930203", "4930204")
SITUACOES = {"01": "NULA", "02": "ATIVA", "03": "SUSPENSA", "04": "INAPTA", "08": "BAIXADA"}
COMPETENCIA = "2026-10"
ORIGEM = "https://huggingface.co/datasets/cnpjaberto/cnpj-dados-receita-brasil-2026-10"
FONTE_OFICIAL = "https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9"
HF = "hf://datasets/cnpjaberto/cnpj-dados-receita-brasil-2026-10/"
DESTINO = Path(os.environ.get("DESTINO_SP", "resultado")).resolve()
DESTINO.mkdir(parents=True, exist_ok=True)

def texto(v):
    return "" if v is None else str(v).strip()

def cnpj_formatado(valor):
    digitos = re.sub(r"\D", "", texto(valor)).zfill(14)
    if len(digitos) != 14:
        raise ValueError("CNPJ incompleto: " + repr(valor))
    return f"{digitos[:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:]}"

def cep_formatado(valor):
    d = re.sub(r"\D", "", texto(valor))
    return f"{d[:5]}-{d[5:]}" if len(d) == 8 else d

def data_br(valor):
    s = texto(valor)
    if len(s) == 8 and s.isdigit() and s != "00000000":
        try:
            return datetime.strptime(s, "%Y%m%d").strftime("%d/%m/%Y")
        except ValueError:
            return s
    return s

def fone(ddd, numero):
    a, b = re.sub(r"\D", "", texto(ddd)), re.sub(r"\D", "", texto(numero))
    return f"({a}) {b}" if a and b else (b or "")

def excel_seguro(valor):
    s = texto(valor)
    if s.startswith(("=", "+", "-", "@")):
        return "'" + s
    return s

def endereco_partes(tipo, logradouro, numero, complemento, bairro, cidade, uf, cep):
    rua = " ".join(p for p in [texto(tipo), texto(logradouro)] if p).strip()
    num = texto(numero)
    complemento = texto(complemento)
    bloco = ", ".join(x for x in [rua, num, complemento] if x)
    partes = [bloco, texto(bairro), (texto(cidade) + "/" + uf if cidade else uf), cep]
    return " - ".join(x for x in partes if x)

def conectar():
    db = duckdb.connect(str(DESTINO / "cnpj_onibus_sp_work.duckdb"))
    db.execute("SET threads=4")
    db.execute("SET memory_limit='6GB'")
    db.execute("SET temp_directory='" + str(DESTINO / "tmp").replace("'", "''") + "'")
    db.execute("INSTALL httpfs")
    db.execute("LOAD httpfs")
    return db

def buscar():
    db = conectar()
    db.execute("DROP TABLE IF EXISTS estabelecimentos_filtrados")
    db.execute("DROP TABLE IF EXISTS razoes")
    db.execute("CREATE TABLE estabelecimentos_filtrados AS SELECT "
               "cnpj_basico,cnpj_ordem,cnpj_dv,identificador_matriz_filial,"
               "nome_fantasia,situacao_cadastral,data_situacao_cadastral,"
               "cnae_fiscal_principal,cnae_fiscal_secundaria,tipo_logradouro,"
               "logradouro,numero,complemento,bairro,cep,uf,municipio,"
               "ddd1,telefone1,ddd2,telefone2,correio_eletronico "
               "FROM read_parquet(?) WHERE 1=0",
               [HF + "estabelecimentos/estabelecimentos0.parquet"])

    codigos = ",".join("'" + x + "'" for x in CNAES)
    filtro = "uf = 'SP' AND situacao_cadastral = '02' AND cnae_fiscal_principal IN (" + codigos + ")"
    for i in range(10):
        path = HF + f"estabelecimentos/estabelecimentos{i}.parquet"
        print("LENDO ESTABELECIMENTOS", i + 1, "DE 10:", path, flush=True)
        db.execute(
            "INSERT INTO estabelecimentos_filtrados SELECT "
            "cnpj_basico,cnpj_ordem,cnpj_dv,identificador_matriz_filial,"
            "nome_fantasia,situacao_cadastral,data_situacao_cadastral,"
            "cnae_fiscal_principal,cnae_fiscal_secundaria,tipo_logradouro,"
            "logradouro,numero,complemento,bairro,cep,uf,municipio,"
            "ddd1,telefone1,ddd2,telefone2,correio_eletronico "
            "FROM read_parquet(?) WHERE " + filtro,
            [path],
        )
        print("ACUMULADOS", db.execute("SELECT COUNT(*) FROM estabelecimentos_filtrados").fetchone()[0], flush=True)
    db.execute("CREATE TABLE razoes(cnpj_basico VARCHAR PRIMARY KEY, razao_social VARCHAR)")
    for i in range(10):
        path = HF + f"empresas/empresas{i}.parquet"
        print("LENDO RAZOES SOCIAIS", i + 1, "DE 10", flush=True)
        db.execute(
            "INSERT OR IGNORE INTO razoes "
            "SELECT a.cnpj_basico,a.razao_social FROM read_parquet(?) a "
            "SEMI JOIN (SELECT DISTINCT cnpj_basico FROM estabelecimentos_filtrados) f "
            "ON a.cnpj_basico = f.cnpj_basico",
            [path],
        )
    print("BUSCANDO MUNICIPIOS", flush=True)
    db.execute("CREATE OR REPLACE TABLE cidades AS SELECT codigo, descricao FROM read_parquet(?)", [HF + "municipios/municipios.parquet"])
    resultado = db.execute(
        "SELECT s.cnpj_basico||s.cnpj_ordem||s.cnpj_dv AS cnpj,"
        "coalesce(e.razao_social,''),coalesce(s.nome_fantasia,''),"
        "s.identificador_matriz_filial,s.cnae_fiscal_principal,"
        "coalesce(s.cnae_fiscal_secundaria,''),s.situacao_cadastral,"
        "s.data_situacao_cadastral,coalesce(m.descricao,''),s.uf,"
        "s.tipo_logradouro,s.logradouro,s.numero,s.complemento,s.bairro,"
        "s.cep,s.ddd1,s.telefone1,s.ddd2,s.telefone2,s.correio_eletronico "
        "FROM estabelecimentos_filtrados s "
        "LEFT JOIN razoes e USING (cnpj_basico) "
        "LEFT JOIN cidades m ON s.municipio=m.codigo "
        "ORDER BY CASE WHEN s.situacao_cadastral='02' THEN 0 ELSE 1 END,"
        "m.descricao,e.razao_social,s.cnpj_basico,s.cnpj_ordem,s.cnpj_dv"
    ).fetchall()
    return resultado

CAMPOS = [
    "CNPJ", "Razão Social", "Nome Fantasia", "Matriz/Filial",
    "CNAE Principal", "CNAEs Secundários", "CNAEs do Filtro Encontrados",
    "Situação Cadastral", "Código Situação", "Data Situação Cadastral",
    "Município", "UF", "Tipo Logradouro", "Logradouro", "Número",
    "Complemento", "Bairro", "CEP", "Endereço Completo",
    "Telefone 1", "Telefone 2", "E-mail", "Competência", "Fonte"
]

def tratar(linhas):
    seen = set()
    origem_cnaes = set(CNAES)
    for item in linhas:
        (cnpj, razao, fantasia, identificador, principal, secundarios, situacao,
         data_situacao, municipio, uf, tipo, logradouro, numero, complemento,
         bairro, cep, ddd1, telefone1, ddd2, telefone2, email) = item
        cnpj = cnpj_formatado(cnpj)
        if cnpj in seen:
            continue
        seen.add(cnpj)
        secundarios = texto(secundarios)
        codigos_sec = [x.strip() for x in secundarios.split(",") if x.strip()]
        encontrados = sorted(origem_cnaes.intersection([texto(principal)] + codigos_sec))
        if texto(uf) != "SP" or not encontrados:
            raise AssertionError("Erro de filtro SP/CNAE: " + cnpj)
        cep = cep_formatado(cep)
        linha = [
            cnpj, texto(razao), texto(fantasia),
            "MATRIZ" if identificador == "1" else "FILIAL",
            texto(principal), secundarios, ",".join(encontrados),
            SITUACOES.get(texto(situacao), "NÃO IDENTIFICADA"), texto(situacao),
            data_br(data_situacao), texto(municipio), "SP",
            texto(tipo), texto(logradouro), texto(numero), texto(complemento),
            texto(bairro), cep,
            endereco_partes(tipo, logradouro, numero, complemento, bairro, municipio, "SP", cep),
            fone(ddd1, telefone1), fone(ddd2, telefone2), texto(email),
            COMPETENCIA, ORIGEM,
        ]
        yield linha

def criar_arquivos(linhas):
    caminho_csv=DESTINO/"CNPJS_TRANSPORTES_PRINCIPAL_SP_ATIVOS_2026-10.csv"
    count=Counter()
    municipio=Counter()
    total=0
    with caminho_csv.open("w", encoding="utf-8-sig",newline="") as fd:
        writer=csv.writer(fd,delimiter=";")
        writer.writerow(CAMPOS)
        for row in tratar(linhas):
            writer.writerow([excel_seguro(v) for v in row])
            total+=1
            count[row[4]]+=1
            municipio[row[10]]+=1
            if total % 40000==0: print("EXPORTADOS:",total,flush=True)
    metadata={
      "competencia":COMPETENCIA,
      "criterios":"UF SP, situação cadastral 02, CNAE PRINCIPAL de ônibus regular/fretamento ou carga rodoviária",
      "fonte_primaria":FONTE_OFICIAL,
      "espelho":ORIGEM,
      "total":total,
      "distribuicao_cnae":dict(count),
      "municipios_com_registros":len(municipio),
      "arquivo":caminho_csv.name,
      "gerado_em_utc":datetime.now(timezone.utc).isoformat(timespec="seconds")
    }
    (DESTINO/"METADADOS_TRANSPORTES_PRINCIPAL_SP.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    return total,metadata

def principal():
    print("FONTE",ORIGEM,"COMPETENCIA",COMPETENCIA,flush=True)
    linhas=buscar()
    print("EXEMPLO DO BANCO:", [str(x)[:40] for x in linhas[0][:11]] if linhas else "VAZIO", flush=True)
    print("REGISTROS BRUTOS SP/CNAE:",len(linhas),flush=True)
    total,metadata=criar_arquivos(linhas)
    if not total:
        raise RuntimeError("NENHUM REGISTRO ENCONTRADO: não gerar lista vazia.")
    print("FINALIZADO",total,"CNPJs",metadata["situacoes"],flush=True)

if __name__ == "__main__":
    principal()

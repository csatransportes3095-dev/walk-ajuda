#!/usr/bin/env python3
"""Extrai todos os estabelecimentos de SP com os 6 CNAEs de passageiros da carga CNPJ 2026-10.
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

CNAES = ("4921301", "4921302", "4922101", "4922102", "4929901", "4929902")
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
    regex = r"(^|,)[[:space:]]*(4921301|4921302|4922101|4922102|4929901|4929902)[[:space:]]*(,|$)"
    filtro = ("uf = 'SP' AND "
              "(cnae_fiscal_principal IN (" + codigos + ") "
              "OR regexp_matches(coalesce(cnae_fiscal_secundaria,''), ?))")
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
            [path, regex],
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
    caminho_csv = DESTINO / "CNPJS_ONIBUS_SP_GERAL_2026-10.csv"
    caminho_xlsx = DESTINO / "CNPJS_ONIBUS_SP_GERAL_2026-10.xlsx"
    resumo = Counter()
    cidades = Counter()
    cnaes = Counter()
    # Em Outubro/2026 são muitos estabelecimentos. Write-only impede que milhões
    # de células fiquem em RAM ao gerar o Excel.
    wb = Workbook(write_only=True)
    header_bg = PatternFill("solid", fgColor="12213C")
    header_font = Font(name="Aptos", color="FFFFFF", bold=True, size=10)
    alert_font = Font(name="Aptos", color="B66B28", size=10)
    ok_font = Font(name="Aptos", color="127B50", size=10)

    def heading(ws, cells):
        result = []
        for value in cells:
            cell = WriteOnlyCell(ws, value=valor_excel(value))
            cell.fill = header_bg
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            result.append(cell)
        return result

    def valor_excel(v):
        return excel_seguro(v)

    ws = wb.create_sheet("SP_GERAL")
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "C2"
    # Todos os registros têm um único CNPJ. Contagem de início serve para auto-filtro.
    ws.auto_filter.ref = f"A1:X{len(linhas)+1}"
    widths = [22,44,32,15,17,31,30,21,15,20,24,8,19,35,12,23,26,14,60,19,19,33,16,53]
    for i,w in enumerate(widths,1):
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.append(heading(ws,CAMPOS))
    total=0
    sem_razao=0
    with caminho_csv.open("w", encoding="utf-8-sig", newline="") as fo:
        writer = csv.writer(fo, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(CAMPOS)
        for row in tratar(linhas):
            safe = [valor_excel(v) for v in row]
            writer.writerow(safe)
            # Apenas a situação cadastral recebe estilo; as demais células
            # ficam como dados importados sem carregar milhões de estilos em RAM.
            situation=WriteOnlyCell(ws, value=safe[7])
            situation.font = ok_font if row[7] == "ATIVA" else alert_font
            safe[7] = situation
            ws.append(safe)
            total += 1
            resumo[row[7]] += 1
            cidades[(row[10], row[7])] += 1
            if not row[1]: sem_razao += 1
            for c in row[6].split(","): cnaes[c] += 1
            if total % 20000 == 0:
                print("EXPORTADOS:", total, flush=True)

    folha=wb.create_sheet("RESUMO")
    folha.sheet_view.showGridLines=False
    folha.column_dimensions["A"].width=60
    folha.column_dimensions["B"].width=90
    folha.append(heading(folha,["CNPJs DE ÔNIBUS EM SP | DADOS ABERTOS RFB | 2026-10",""]))
    folha.append(["Registros (matrizes e filiais)",total])
    folha.append(["Razões sociais não encontradas",sem_razao])
    folha.append(["Fonte primária",FONTE_OFICIAL])
    folha.append(["Espelho utilizado",ORIGEM])
    folha.append(["Competência",COMPETENCIA])
    folha.append([])
    folha.append(heading(folha,["Situação cadastral","Total"]))
    for name,count in resumo.most_common():folha.append([name,count])
    folha.append([])
    folha.append(heading(folha,["CNAE de filtro","Estabelecimentos que o possuem (contagens podem se sobrepor)"]))
    for cod in CNAES:folha.append([cod,cnaes.get(cod,0)])

    mun=wb.create_sheet("MUNICIPIOS")
    mun.sheet_view.showGridLines=False
    mun.freeze_panes="A2"
    mun.column_dimensions["A"].width=33
    mun.column_dimensions["B"].width=25
    mun.column_dimensions["C"].width=14
    mun.append(heading(mun,["Município","Situação","Total"]))
    for (nome,status), n in sorted(cidades.items(),key=lambda x:(x[0][0],x[0][1])):
        mun.append([nome,status,n])
    mun.auto_filter.ref=f"A1:C{len(cidades)+1}"

    info=wb.create_sheet("METODOLOGIA")
    info.sheet_view.showGridLines=False
    info.column_dimensions["A"].width=42
    info.column_dimensions["B"].width=115
    notes=[
      ("Abrangência","Todos os estabelecimentos com UF SP, matrizes e filiais."),
      ("Filtro principal/secundário",", ".join(CNAES)),
      ("Situação","ATIVA (02) primeiro, demais situações incluídas."),
      ("Data de referência da base",COMPETENCIA),
      ("Fonte primária",FONTE_OFICIAL),
      ("Fonte efetivamente lida",ORIGEM),
      ("Rastreabilidade","Parquet espelho da Receita Federal. Não houve consulta individual de CNPJ."),
      ("Matrizes/filiais","Cada CNPJ de 14 dígitos é uma linha independente."),
      ("Critério do CNAE","Correspondência exata do código principal OU de um dos secundários."),
      ("Deduplicação","CNPJ completo de 14 dígitos, não razão social."),
      ("Telefone e e-mail","Contatos como constam da base; podem estar desatualizados."),
      ("CNAE secundário","Lista integral da Receita, separada por vírgulas."),
      ("Município","Traduzido via tabela Municipios da mesma competência."),
      ("Cidades abrangidas","Todo o estado de São Paulo, não apenas a capital."),
      ("Data de exportação",datetime.now(timezone.utc).isoformat(timespec="seconds")),
    ]
    info.append(heading(info,["Critério","Detalhes"]))
    for row in notes:
        info.append([valor_excel(x) for x in row])
    print("GRAVANDO XLSX", total, "linhas",flush=True)
    wb.save(caminho_xlsx)
    metadata = {
      "competencia": COMPETENCIA,"fonte_primaria":FONTE_OFICIAL,"espelho":ORIGEM,
      "filtro_uf":"SP","filtro_cnaes":list(CNAES),
      "total_cnpjs_unicos": total,"situacoes":dict(resumo),
      "faltando_razao_social":sem_razao,
      "data_extracao_utc":datetime.now(timezone.utc).isoformat(timespec="seconds"),
      "arquivos":[caminho_csv.name,caminho_xlsx.name],
    }
    (DESTINO/"RELATORIO_EXTRACAO.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    return total,metadata

def principal():
    print("FONTE",ORIGEM,"COMPETENCIA",COMPETENCIA,flush=True)
    linhas=buscar()
    print("EXEMPLO DO BANCO:", [str(x)[:40] for x in linhas[0][:11]] if linhas else "VAZIO", flush=True)
    print("REGISTROS BRUTOS SP/CNAE:",len(linhas),flush=True)
    total,metadata=criar_arquivos(linhas)
    if not total:
        raise RuntimeError("NENHUM REGISTRO ENCONTRADO: não gerar lista vazia.")
    with ZipFile(DESTINO/"CNPJS_ONIBUS_SP_GERAL_2026-10.zip","w",compression=ZIP_DEFLATED,compresslevel=6) as zip:
        for f in [DESTINO/x for x in metadata["arquivos"]]+[DESTINO/"RELATORIO_EXTRACAO.json"]:
            zip.write(f, arcname=f.name)
    print("FINALIZADO",total,"CNPJs",metadata["situacoes"],flush=True)

if __name__ == "__main__":
    principal()

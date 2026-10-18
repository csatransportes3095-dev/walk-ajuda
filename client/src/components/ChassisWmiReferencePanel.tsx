import { useState } from "react";
import { consultarFabricanteWmi, extrairPrefixoWmi, REFERENCIAS_WMI_REVISADAS } from "@shared/chassisWmiReference";

/** Consulta informativa sem vínculo com a geração. */
export default function ChassisWmiReferencePanel() {
 const [entrada,setEntrada]=useState("");
 const prefixo=extrairPrefixoWmi(entrada);
 const resultado=consultarFabricanteWmi(entrada);
 return <section aria-label="Consulta de fabricante por WMI" className="rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-4 sm:p-5">
  <h3 className="text-sm font-bold text-cyan-300">Consulta de fabricante pelo WMI</h3>
  <p className="mt-1 text-xs text-zinc-400">Consulte os três primeiros caracteres de um chassi. Não interfere no gerador.</p>
  <label htmlFor="chassis-wmi-lookup" className="mt-3 block text-xs font-semibold text-zinc-300">Prefixo WMI ou chassi para consulta</label>
  <input id="chassis-wmi-lookup" value={entrada} onChange={e=>setEntrada(e.target.value.toUpperCase().slice(0,17))} maxLength={17} placeholder="Ex.: 9BD, 93Y, 94D, 936" spellCheck={false} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-cyan-400"/>
  {entrada.trim()&&<p role="status" className="mt-3 text-sm text-cyan-200">{resultado?resultado.prefixo+" — "+resultado.fabricante+" (referência)":prefixo?"Prefixo "+prefixo+" não consta na lista revisada.":"Informe três caracteres válidos."}</p>}
  <div className="mt-3 flex flex-wrap gap-2">{REFERENCIAS_WMI_REVISADAS.map(x=><span key={x.prefixo} className="rounded-lg border border-white/10 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">{x.fabricante} <strong className="font-mono text-cyan-300">{x.prefixo}</strong></span>)}</div>
  <p className="mt-3 text-xs text-amber-200/75">A identificação pelo prefixo não comprova autenticidade do chassi, modelo, ano ou fabricação. Confirme em registros oficiais.</p>
 </section>;
}

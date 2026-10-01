import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import { TRPCError } from '@trpc/server';
import { getConfiguredGlobalProgressKeys, sanitizeGlobalProgressKeys } from '../shared/orderProgressSequence';

// Execute the REAL handler body with mock database functions, binding only names
// actually imported by routers.ts. A missing import must throw, not be hidden by a mock.
const source=fs.readFileSync('server/routers.ts','utf8');
const tree=ts.createSourceFile('routers.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const imported=new Set<string>();
for(const statement of tree.statements) {
  if(ts.isImportDeclaration(statement)) {
    const bindings=statement.importClause?.namedBindings;
    if(bindings && ts.isNamedImports(bindings)) for(const item of bindings.elements) imported.add(item.name.text);
  }
}
function handler(name: string, mocks: Record<string, unknown>) {
  let block: ts.ObjectLiteralExpression | undefined;
  const findBlock=(node: ts.Node) => {
    if(ts.isPropertyAssignment(node) && node.name.getText(tree)==='statusTypes' && ts.isCallExpression(node.initializer)) {
      const first=node.initializer.arguments[0]; if(first && ts.isObjectLiteralExpression(first)) block=first;
    }
    ts.forEachChild(node,findBlock);
  };
  findBlock(tree);
  if(!block) throw new Error('Status router not found');
  const property=block.properties.find(p=>ts.isPropertyAssignment(p) && p.name.getText(tree)===name) as ts.PropertyAssignment | undefined;
  if(!property || !ts.isCallExpression(property.initializer)) throw new Error('Handler not found: '+name);
  const callback=property.initializer.arguments[0];
  if(!callback || !ts.isArrowFunction(callback)) throw new Error('Unexpected handler form');
  const scope: Record<string, unknown>={};
  for(const [key,value] of Object.entries({getConfiguredGlobalProgressKeys,sanitizeGlobalProgressKeys,TRPCError,...mocks})) {
    if(imported.has(key)) scope[key]=value;
  }
  const output=ts.transpileModule('globalThis.callback = '+callback.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output,scope,{timeout:1000});
  return scope.callback as (...args: any[])=>Promise<any>;
}
const statuses=[
  {key:'recebido',isActive:1,isGlobal:1,showInProgress:1,progressOrder:1},
  {key:'custom',isActive:1,isGlobal:0,showInProgress:1,progressOrder:2},
  {key:'pedido_entregue',isActive:1,isGlobal:1,showInProgress:1,progressOrder:3},
];
describe('actual global progress route wiring',()=>{
  it('reads enabled progress without ReferenceError and excludes custom entries',async()=>{
    const listOrderStatusTypes=vi.fn(async()=>statuses);
    const result=await handler('getProgressSequence',{listOrderStatusTypes,getSetting:async()=>'1'})();
    expect(result).toEqual({enabled:true,keys:['recebido','pedido_entregue']});
    expect(listOrderStatusTypes).toHaveBeenCalledOnce();
  });
  it('preserves the disabled mode without activating settings during a read',async()=>{
    expect(await handler('getProgressSequence',{listOrderStatusTypes:async()=>statuses,getSetting:async()=>null})()).toEqual({enabled:false,keys:[]});
  });
  it('saves only valid global keys and keeps the explicit activation step',async()=>{
    const save=vi.fn(async()=>undefined), activate=vi.fn(async()=>undefined);
    const result=await handler('setProgressSequence',{listOrderStatusTypes:async()=>statuses,setGlobalOrderProgressSequence:save,upsertSetting:activate})({input:{statusKeys:['recebido','custom','pedido_entregue']}});
    expect(save).toHaveBeenCalledWith(['recebido','pedido_entregue']);
    expect(activate).toHaveBeenCalledWith('order_progress_global_enabled','1');
    expect(result.success).toBe(true);
  });
  it('rejects an entirely invalid sequence without calling write functions',async()=>{
    const save=vi.fn(), activate=vi.fn();
    await expect(handler('setProgressSequence',{listOrderStatusTypes:async()=>statuses,setGlobalOrderProgressSequence:save,upsertSetting:activate})({input:{statusKeys:['custom']}})).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(save).not.toHaveBeenCalled(); expect(activate).not.toHaveBeenCalled();
  });
});

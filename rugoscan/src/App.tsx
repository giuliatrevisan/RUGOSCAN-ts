import { useState } from 'react';
import {
  Project,
  Workspace,
  CountType,
  LinkProperty
} from 'epanet-js';

// Função que corrige a seção [PIPES] inserindo rugosidade padrão onde faltar
function corrigirRugosidadeINP(inpText: string, valorPadrao: number = 100): string {
  const linhas = inpText.split(/\r?\n/);
  const resultado: string[] = [];

  let dentroDePipes = false;

  for (let linha of linhas) {
    const linhaTrim = linha.trim();

    if (linhaTrim.startsWith('[')) {
      dentroDePipes = linhaTrim.toUpperCase() === '[PIPES]';
      resultado.push(linha);
      continue;
    }

    if (dentroDePipes && linhaTrim && !linhaTrim.startsWith(';')) {
      const partes = linha.trim().split(/\s+/);

      // Esperado: ID Node1 Node2 Length Diameter Roughness MinorLoss Status
      if (partes.length === 7) {
        partes.splice(5, 0, valorPadrao.toString()); // Insere rugosidade na posição correta
        linha = partes.join(' ');
      }
    }

    resultado.push(linha);
  }

  return resultado.join('\n');
}

function App() {
  const [output, setOutput] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const inpCorrigido = corrigirRugosidadeINP(text); // Aplica correção automática

      const workspace = new Workspace();
      await workspace.loadModule();

      const project = new Project(workspace);
      workspace.writeFile('network.inp', inpCorrigido);

      await project.open('network.inp', 'report.rpt', 'output.out');
      await project.solveH();

      const numLinks = await project.getCount(CountType.LinkCount);
      let result = `Total de tubos: ${numLinks}\n\n`;

      for (let i = 1; i <= numLinks; i++) {
        const id = await project.getLinkId(i);
        const tipo = await project.getLinkType(i);
        if (tipo === 0) {
          const rug = await project.getLinkValue(i, LinkProperty.Roughness);
          result += `Tubo ${id} - Rugosidade: ${rug.toFixed(3)}\n`;
        }
      }

      await project.close();
      setOutput(result);

    } catch (err: any) {
      setOutput(`❌ Erro ao processar o arquivo .INP:\n\n${err.message}\n\n📌 Verifique se o arquivo está no formato correto do EPANET.\nExemplo: deve conter as seções [JUNCTIONS], [PIPES], [END] etc.`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>EPANET - Análise de Rugosidade</h1>
      <input type="file" accept=".inp" onChange={handleFile} />
      <pre
        style={{
          background: output.startsWith('❌') ? '#ffe6e6' : '#f2f2f2',
          color: output.startsWith('❌') ? '#990000' : '#000',
          padding: 10,
          marginTop: 20,
          border: output.startsWith('❌') ? '1px solid #ff4d4d' : 'none',
          whiteSpace: 'pre-wrap'
        }}
      >
        {output}
      </pre>
    </div>
  );
}

export default App;

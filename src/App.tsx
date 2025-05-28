import { useState } from 'react';
import {
  Project,
  Workspace,
  CountType,
  LinkProperty
} from 'epanet-js';

// Corrige a seção [PIPES]
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
      const id = partes[0] ?? '';
      const node1 = partes[1] ?? '';
      const node2 = partes[2] ?? '';
      const length = partes[3] ?? '0';
      const diameter = partes[4] ?? '100';
      const roughness = partes[5] ?? valorPadrao.toString();
      const minorLoss = partes[6] ?? '0.0';
      const status = partes[7] ?? 'Open';
      linha = [id, node1, node2, length, diameter, roughness, minorLoss, status].join(' ');
    }

    resultado.push(linha);
  }

  return resultado.join('\n');
}

// Remove seções que estão vazias ou só têm comentários
function limparSecoesVazias(inpText: string): string {
  const linhas = inpText.split(/\r?\n/);
  const resultado: string[] = [];

  let dentroDeSecao = false;
  let bufferSecao: string[] = [];

  function salvarSecaoSeValida() {
    const linhasValidas = bufferSecao.filter(l => l.trim() !== '' && !l.trim().startsWith(';'));
    if (linhasValidas.length > 1) {
      resultado.push(...bufferSecao);
    }
    bufferSecao = [];
  }

  for (let linha of linhas) {
    if (linha.trim().startsWith('[') && linha.trim().endsWith(']')) {
      if (bufferSecao.length > 0) salvarSecaoSeValida();
      dentroDeSecao = true;
    }

    if (dentroDeSecao) {
      bufferSecao.push(linha);
    } else {
      resultado.push(linha);
    }
  }

  if (bufferSecao.length > 0) salvarSecaoSeValida();

  return resultado.join('\n');
}


// Garante seções obrigatórias para o EPANET-WASM
function garantirSecoesObrigatorias(inp: string): string {
  const secoesObrigatorias = [
    '[OPTIONS]',
    '[REPORT]',
    '[TIMES]',
    '[ENERGY]'
  ];
  const jaIncluidas = new Set(inp.match(/\[(.*?)\]/g)?.map(s => s.toUpperCase()) || []);
  let textoFinal = inp;

  for (const secao of secoesObrigatorias) {
    if (!jaIncluidas.has(secao)) {
      textoFinal = textoFinal.replace(/\[END\]/i, `${secao}\n; (auto)\n\n[END]`);
    }
  }

  return textoFinal;
}

// Função completa de normalização
function normalizarINP(original: string): string {
  const comRugosidade = corrigirRugosidadeINP(original);
  const limpo = limparSecoesVazias(comRugosidade);
  const completo = garantirSecoesObrigatorias(limpo);
  return completo;
}


function App() {
  const [output, setOutput] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const inpCorrigido = normalizarINP(text);

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

import { useState } from 'react';
import {
  Project,
  Workspace,
  CountType,
  LinkProperty,
  NodeProperty
} from 'epanet-js';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Typography, Box
} from '@mui/material';


interface LinhaTabela {
  id: string;
  node1: string;
  node2: string;
  length: number;
  diameter: number;
  roughness: number;
  flow: number;
  pressure: number;
}

// Corrige a seção [PIPES]
function corrigirRugosidadeINP(inpText: string, valorPadrao: number = 100): string {
  const linhas: string[] = inpText.split(/\r?\n/);
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
      const partes: string[] = linha.trim().split(/\s+/);
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
  const linhas: string[] = inpText.split(/\r?\n/);
  const resultado: string[] = [];

  let bufferSecao: string[] = [];

  function salvarSecaoSeValida() {
    const linhasValidas = bufferSecao.filter(l => l.trim() !== '' && !l.trim().startsWith(';'));
    if (linhasValidas.length > 1) {
      resultado.push(...bufferSecao);
    }
    bufferSecao = [];
  }

  for (const linha of linhas) {
    if (linha.trim().startsWith('[') && linha.trim().endsWith(']')) {
      if (bufferSecao.length > 0) salvarSecaoSeValida();
    }
    bufferSecao.push(linha);
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
  const [dados, setDados] = useState<LinhaTabela[]>([]);
  const [erro, setErro] = useState<string>('');

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
      const linhas: LinhaTabela[] = [];

      for (let i = 1; i <= numLinks; i++) {
        const id = await project.getLinkId(i);
        const nodes = await project.getLinkNodes(i);
        const length = await project.getLinkValue(i, LinkProperty.Length) ?? 0;
        const diameter = await project.getLinkValue(i, LinkProperty.Diameter) ?? 0;
        const roughness = await project.getLinkValue(i, LinkProperty.Roughness) ?? 0;
        const flow = await project.getLinkValue(i, LinkProperty.Flow) ?? 0;
        const pressureNode1 = await project.getNodeValue(nodes.node1, NodeProperty.Pressure) ?? 0;

        linhas.push({
          id,
          node1: String(nodes.node1),
          node2: String(nodes.node2),
          length,
          diameter,
          roughness,
          flow,
          pressure: pressureNode1
        });
        
      }

      await project.close();
      setErro('');
      setDados(linhas);
    } catch (err: any) {
      setErro(`❌ Erro ao processar o arquivo .INP:\n\n${err.message}`);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: '1000px', mx: 'auto' }}>
      <Typography variant="h4" align="center" gutterBottom color="primary">
        🧪 EPANET - Relatório da Rede Hidráulica
      </Typography>

      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <label htmlFor="inpFile">
          <Box
            component="span"
            sx={{
              px: 3,
              py: 1,
              bgcolor: 'primary.main',
              color: '#fff',
              borderRadius: 2,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Selecionar Arquivo .INP
          </Box>
        </label>
        <input
          id="inpFile"
          type="file"
          accept=".inp"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </Box>

      {erro ? (
        <Paper sx={{ p: 2, bgcolor: '#ffe6e6', color: '#b91c1c', border: '1px solid #f87171' }}>
          <Typography variant="body1" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
            {erro}
          </Typography>
        </Paper>
      ) : dados.length > 0 ? (
        <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Node1</strong></TableCell>
                <TableCell><strong>Node2</strong></TableCell>
                <TableCell><strong>Comprimento</strong></TableCell>
                <TableCell><strong>Diâmetro</strong></TableCell>
                <TableCell><strong>Rugosidade</strong></TableCell>
                <TableCell><strong>Vazão</strong></TableCell>
                <TableCell><strong>Pressão (Node1)</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dados.map((row, index) => (
                <TableRow
                  key={row.id}
                  sx={{
                    bgcolor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                    '&:hover': {
                      backgroundColor: '#e0f2fe'
                    }
                  }}
                >
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.node1}</TableCell>
                  <TableCell>{row.node2}</TableCell>
                  <TableCell>{row.length.toFixed(2)}</TableCell>
                  <TableCell>{row.diameter.toFixed(2)}</TableCell>
                  <TableCell>{row.roughness.toFixed(2)}</TableCell>
                  <TableCell>{row.flow.toFixed(2)}</TableCell>
                  <TableCell>{row.pressure.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography align="center" sx={{ mt: 2 }}>📂 Nenhum arquivo carregado ainda.</Typography>
      )}
    </Box>
  );
}

export default App;
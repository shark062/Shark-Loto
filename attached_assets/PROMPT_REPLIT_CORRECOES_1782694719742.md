# PROMPT PARA REPLIT AGENT — CORREÇÕES SHARK LOTERIAS

> **Como usar:** Envie este prompt junto com o arquivo ZIP `Shark-Loto-corrigido.zip`
> O ZIP contém 4 arquivos já prontos. Sua única tarefa é substituí-los nos caminhos corretos.

---

## TAREFA

Aplique as correções do projeto Shark Loterias substituindo 4 arquivos específicos pelos arquivos fornecidos no ZIP `Shark-Loto-corrigido.zip`. Não altere nenhum outro arquivo do projeto.

---

## PASSO 1 — Extraia o ZIP

Extraia o arquivo `Shark-Loto-corrigido.zip` que foi enviado junto com este prompt. Ele contém esta estrutura:

```
artifacts/
  loto-shark/src/pages/
    AIAnalysis.tsx
    Results.tsx
  api-server/src/lib/
    lotteryData.ts
  api-server/src/routes/
    index.ts
```

---

## PASSO 2 — Substitua os arquivos

Copie cada arquivo do ZIP para o caminho correspondente no projeto, **sobrescrevendo** o arquivo existente:

| Arquivo no ZIP | Destino no projeto |
|---|---|
| `artifacts/loto-shark/src/pages/AIAnalysis.tsx` | `artifacts/loto-shark/src/pages/AIAnalysis.tsx` |
| `artifacts/loto-shark/src/pages/Results.tsx` | `artifacts/loto-shark/src/pages/Results.tsx` |
| `artifacts/api-server/src/lib/lotteryData.ts` | `artifacts/api-server/src/lib/lotteryData.ts` |
| `artifacts/api-server/src/routes/index.ts` | `artifacts/api-server/src/routes/index.ts` |

---

## PASSO 3 — Verifique as correções aplicadas

Após substituir, confirme que cada arquivo contém os trechos abaixo. **Não modifique o conteúdo — apenas confirme que estão presentes.**

### ✅ AIAnalysis.tsx
- NÃO deve conter as palavras: `Padrões`, `Predições`, `Estratégias`, `Prognóstico Real`, `Nova Predição`
- DEVE conter apenas: `Brain`, `Activity`, `Target` como ícones de status da IA
- DEVE conter os botões: `Ir para Gerador` e `Ver Mapa de Calor`

### ✅ lotteryData.ts
- DEVE conter a linha: `const CAIXA_ALT_API = 'https://loteriasapi.vercel.app/api';`
- DEVE conter a função: `async function tryFetchCaixa(`
- Dentro de `fetchLatestDraw`, DEVE conter o bloco de fallback:
  ```typescript
  if (!data) {
    console.warn(`[Caixa] Fallback alt-api para ${lotteryId}`);
    data = await tryFetchCaixa(`${CAIXA_ALT_API}/${lotteryId}`, 8000);
  }
  ```
- NÃO deve ter duas declarações de `const CAIXA_HEADERS` (apenas uma, no topo)

### ✅ routes/index.ts (rota POST /api/games/generate)
- DEVE conter, dentro da rota `router.post("/games/generate"`, o bloco:
  ```typescript
  let nextContestNumber: number | null = null;
  let nextDrawDate: string | null = null;
  try {
    const latestDraw = await fetchLatestDraw(lotteryId);
    if (latestDraw) {
      nextContestNumber = latestDraw.numeroConcursoProximo ?? ((latestDraw.numero ?? 0) + 1);
      nextDrawDate = latestDraw.dataProximoConcurso ?? null;
    }
  } catch { /* ignora */ }
  ```
- DEVE conter `contestNumber: nextContestNumber,` nos valores de insert (não mais `null`)

### ✅ Results.tsx (exportação de PDF)
- Dentro de `exportPDFDetalhado`, DEVE conter:
  ```typescript
  const concursosInfo = filteredGames.reduce<Record<string, { contest: number | null; date: string }>>
  ```
- Dentro de `exportPDFCompacto`, DEVE conter:
  ```typescript
  const dateSample = games[0]?.createdAt
    ? new Date(games[0].createdAt).toLocaleDateString('pt-BR')
    : null;
  ```

---

## PASSO 4 — Reinicie os servidores

Após substituir os arquivos, reinicie ambos os processos do projeto:

1. **Frontend** (`artifacts/loto-shark`): pare e reinicie o servidor de desenvolvimento Vite
2. **Backend** (`artifacts/api-server`): pare e reinicie o servidor Node/Express

Se o projeto usar um script único de start na raiz, basta reiniciar esse script.

---

## O QUE FOI CORRIGIDO (para referência)

### Problema 1 — Aba "IA Análises" com seções indevidas
**Arquivo:** `AIAnalysis.tsx`
**Sintoma:** A tela exibia seções de "Padrões", "Predições", "Estratégias" e "Prognóstico Real" com o botão "Nova Predição" que não deveriam estar lá.
**Correção:** Removidas essas seções. A página agora exibe apenas o status do sistema IA (Nível, % Aprendizado, Taxa de Acerto) e os dois botões de ação.

### Problema 2 — Dados incorretos no Render (valores, concursos, contagem regressiva)
**Arquivo:** `lotteryData.ts`
**Sintoma:** Após o deploy no Render, os dados da API da Caixa não carregavam ou mostravam valores errados/zerados.
**Causa:** O Render bloqueia requisições ao domínio `servicebus2.caixa.gov.br` por reputação de IP de servidor cloud.
**Correção:** Adicionada função `tryFetchCaixa` com retry e uma URL de fallback alternativa. Se a URL principal da Caixa falhar, o backend tenta automaticamente `https://loteriasapi.vercel.app/api/{lotteryId}`.

### Problema 3 — Concurso não salvo ao gerar jogos
**Arquivo:** `routes/index.ts`
**Sintoma:** O `contestNumber` era sempre `null` nos jogos gerados, pois a rota não buscava o próximo concurso antes de salvar.
**Correção:** Antes de fazer o insert no banco, a rota agora chama `fetchLatestDraw` para obter `numeroConcursoProximo` e salva esse valor no campo `contestNumber`.

### Problema 4 — PDF sem data e concurso
**Arquivo:** `Results.tsx`
**Sintoma:** O PDF exportado não mostrava para qual concurso o jogo foi gerado nem a data.
**Correção:**
- **PDF Detalhado**: nova linha verde no cabeçalho com "Modalidade: Concurso #XXXX" para cada loteria presente
- **PDF Compacto**: cada grupo de loteria agora exibe concurso + data de geração no subtítulo

---

## IMPORTANTE — NÃO FAZER

- ❌ Não altere nenhum outro arquivo além dos 4 listados
- ❌ Não instale novas dependências
- ❌ Não altere o schema do banco de dados (`lib/db/src/schema/index.ts`)
- ❌ Não modifique variáveis de ambiente (`.env`, `render.yaml`)
- ❌ Não altere configurações de build (`vite.config.ts`, `tsconfig.json`)

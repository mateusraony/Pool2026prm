Você é o orquestrador da auditoria pré-commit do Pool Intelligence Pro.
Execute os 4 estágios abaixo em ordem. Seja preciso, capture evidências reais (não afirme sem rodar).

---

## STAGE 1 — TypeScript (bloqueante)

Rode EM PARALELO (2 chamadas Bash na mesma mensagem):
- `cd $(git rev-parse --show-toplevel)/pool-intelligence-pro/backend && npx tsc --noEmit 2>&1`
- `cd $(git rev-parse --show-toplevel)/pool-intelligence-pro/frontend && npx tsc --noEmit 2>&1`

Se qualquer um retornar erros → VEREDICTO: ❌ BLOQUEADO. Exiba os erros. NÃO prossiga para Stage 2. Informe o usuário que o commit foi bloqueado e quais arquivos têm erros TypeScript.

Se ambos passarem → prossiga para Stage 2.

---

## STAGE 2 — Testes + Build (bloqueante)

Rode EM PARALELO (2 chamadas Bash na mesma mensagem):
- `cd $(git rev-parse --show-toplevel)/pool-intelligence-pro/backend && npx vitest run 2>&1`
- `cd $(git rev-parse --show-toplevel)/pool-intelligence-pro && npm run build 2>&1`

Capture:
- Número de testes passando/falhando (ex: "264/264")
- Exit code do build

Se vitest tiver falhas OU build falhar → VEREDICTO: ❌ BLOQUEADO. Exiba quais testes falharam. NÃO prossiga para Stage 3.

Se ambos passarem → prossiga para Stage 3.

---

## STAGE 3 — Revisão Profunda (não-bloqueante individualmente)

Dispatch 4 agentes EM PARALELO (A, B, C, E) usando a ferramenta Task. Após receber todos os outputs, dispatch o Agente D passando os textos coletados. NENHUM agente deve escrever arquivos.

**Agente A — Verificação de Evidências**
Use a skill `verification-before-completion`.
Contexto: os Stages 1 e 2 já rodaram. Revise os outputs capturados, confirme que as evidências são reais (não assertivas), identifique warnings não-fatais que merecem atenção.
Retorne: lista de evidências confirmadas + warnings encontrados.

**Agente B — Code Review vs Requisitos**
Use a skill `requesting-code-review`.
Contexto: leia `$(git rev-parse --show-toplevel)/CHECKPOINT.md` (seção mais recente "O QUE FOI FEITO") e rode `git diff HEAD~1 HEAD --name-only` para ver arquivos alterados.
Verifique: os arquivos alterados correspondem ao que foi prometido no CHECKPOINT? Padrões do CLAUDE.md estão sendo seguidos (imports .js no backend, sem console.log, Zod em routes, etc.)?
Retorne: lista de conformidades ✅ e não-conformidades ⚠️/❌ com arquivo:linha.

**Agente C — Simplificação e Qualidade**
Use a skill `simplify`.
Contexto: rode `git diff HEAD~1 HEAD` para ver o diff completo das mudanças.
Analise: há duplicação de lógica? over-engineering? abstrações prematuras? funções muito longas (>50 linhas)? imports não utilizados?
Retorne: lista de achados com arquivo:linha e sugestão de melhoria.

**Agente D — Consolidador (filtra falsos positivos)**
Contexto: você receberá os outputs dos Agentes A, B e C (o orquestrador te passará esses textos).
Aplique o critério da skill `receiving-code-review`: exija evidências para cada achado, rejeite achados subjetivos sem base concreta, classifique os restantes como CRÍTICO / IMPORTANTE / AVISO.
Retorne: lista final filtrada e classificada com arquivo:linha.

**Agente E — Audit Interno**
Execute 3 verificações:

1. **Português** — rode os seguintes greps (escopo: *.ts, *.tsx, *.md, excluindo node_modules/ dist/ .git/):
```bash
cd $(git rev-parse --show-toplevel) && grep -rn --include="*.ts" --include="*.tsx" --include="*.md" \
  -E "\bnao\b|\btambem\b|\bvoce\b|\bconfiguracao\b|\binformacao\b|\boperacao\b|\bconexao\b|\batualizacao\b|\bremocao\b|\badicao\b" \
  --exclude-dir={node_modules,dist,.git} \
  pool-intelligence-pro/ 2>/dev/null | grep -v "//.*http" | head -20
```

2. **Anti-patterns** — rode:
```bash
cd $(git rev-parse --show-toplevel) && grep -rn --include="*.ts" --include="*.tsx" \
  -E "(: any|as any|console\.log|catch\s*\{\s*\}|// @ts-ignore|// @ts-nocheck)" \
  --exclude-dir={node_modules,dist,.git} \
  pool-intelligence-pro/backend/src/ pool-intelligence-pro/frontend/src/ 2>/dev/null | head -30
```

3. **Conformidade** — rode:
```bash
git -C $(git rev-parse --show-toplevel) log --oneline -5
```
Compare os 5 últimos commits com a seção mais recente do CHECKPOINT.md. Estão documentados?

Retorne: resultados das 3 verificações com arquivo:linha para cada achado.

---

## STAGE 4 — Consolidação e Escrita no CHECKPOINT.md

Você (orquestrador) recebeu os outputs de todos os agentes. Agora:

1. **Determine o veredicto final:**
   - `✅ APROVADO` — Stages 1+2 passaram, Stage 3 sem itens CRÍTICO ou IMPORTANTE
   - `⚠️ APROVADO COM AVISOS` — Stages 1+2 passaram, Stage 3 tem apenas AVISOS
   - `❌ BLOQUEADO` — Stage 1 ou Stage 2 falhou (já tratado acima)

2. **Monte a lista priorizada de próximas ações** (apenas itens CRÍTICO e IMPORTANTE do Agente D + críticos do Agente E).

3. **Escreva no CHECKPOINT.md** — adicione/substitua a seção `## Auditoria Pré-Commit` logo após o cabeçalho principal, com este formato exato:

```markdown
## Auditoria Pré-Commit — {DATA} {HORA}

| Verificação        | Resultado | Detalhes                              |
|--------------------|-----------|---------------------------------------|
| tsc backend        | ✅/❌     | 0 erros / N erros                     |
| tsc frontend       | ✅/❌     | 0 erros / N erros                     |
| vitest             | ✅/❌     | N/N passando                          |
| build              | ✅/❌     | exit 0 / exit 1                       |
| verification       | ✅/⚠️/❌  | {resumo Agente A}                     |
| code-review        | ✅/⚠️/❌  | {resumo Agente B}                     |
| simplify           | ✅/⚠️/❌  | {resumo Agente C}                     |
| português          | ✅/⚠️     | N ocorrências / nenhuma               |
| antipatterns       | ✅/⚠️/❌  | {lista arquivo:linha ou "nenhum"}     |
| conformidade       | ✅/⚠️     | commits alinhados / N commits sem doc |

**Veredicto: {✅ APROVADO | ⚠️ APROVADO COM AVISOS | ❌ BLOQUEADO}**

**Próximas ações:**
{lista priorizada — CRÍTICO primeiro, depois IMPORTANTE, depois AVISO}
{se nenhum: "Nenhuma ação necessária."}
```

4. **Informe o resultado final ao usuário** em uma mensagem concisa com o veredicto e os itens mais importantes.

5. **Se veredicto for APROVADO ou APROVADO COM AVISOS:** informe o usuário que pode prosseguir com o commit.
   **Se veredicto for BLOQUEADO:** já foi tratado nos Stages 1 ou 2 — não repita.

---

## Regras de Execução

- NUNCA afirme "passou" sem ter rodado o comando e lido o output
- NUNCA escreva no CHECKPOINT.md antes de ter todos os outputs do Stage 3
- SEMPRE rode Stage 1 antes de Stage 2, Stage 2 antes de Stage 3
- Stages 1 e 2: rode as 2 chamadas Bash EM PARALELO (mesma mensagem, 2 tool calls)
- Stage 3: dispatch 4 agentes EM PARALELO (A, B, C, E), depois Agente D com os outputs coletados
- Apenas Stage 4 escreve no CHECKPOINT.md

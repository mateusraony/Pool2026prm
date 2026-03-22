# Design Spec — Skill `/audit-review`

**Data:** 2026-03-22
**Projeto:** Pool Intelligence Pro
**Status:** Aprovado pelo usuário — v2 (pós spec-review)

---

## Objetivo

Criar uma skill `/audit-review` que rode automaticamente antes de todo `git commit`, orquestrando verificações técnicas, revisão de código, qualidade de português e conformidade com o CHECKPOINT.md — usando agentes paralelos e escrevendo os resultados diretamente no `CHECKPOINT.md`.

---

## Arquitetura

### Arquivos a criar/modificar

```
.claude/
├── commands/
│   └── audit-review.md              ← slash command orquestrador (NOVO)
└── skills/
    └── audit-review/
        ├── pt-patterns.txt           ← dicionário de erros de português (NOVO)
        └── antipatterns.txt          ← anti-patterns do projeto (NOVO)

.claude/settings.json                 ← MODIFICAR: PreToolUse hook + permissão vitest
```

### Fluxo de Execução

```
[git commit tentado via Bash]
        ↓
[PreToolUse hook detecta padrão "git commit"]
        ↓ emite mensagem: "AUDITORIA OBRIGATÓRIA — execute /audit-review antes de commitar"
        ↓ exit code 1 → Bash bloqueado
        ↓
[Claude executa /audit-review]
        ↓
[Stage 1 — tsc backend + tsc frontend] ← paralelo (~10-15s)
        ↓ FALHA → BLOQUEADO: exibir erros, commit NÃO prossegue
        ↓ PASSA
[Stage 2 — vitest run + npm run build] ← paralelo (~15-20s)
        ↓ FALHA → BLOQUEADO
        ↓ PASSA
[Stage 3 — 5 agentes paralelos] ← paralelo (~15-30s LLM latency)
        ├── Agente A: verification-before-completion
        ├── Agente B: requesting-code-review
        ├── Agente C: simplify
        ├── Agente D: consolidador (aplica receiving-code-review como comportamento)
        └── Agente E: audit interno (pt + antipatterns + conformidade)
        ↓ cada agente retorna texto estruturado ao orquestrador (NÃO escreve arquivos)
        ↓
[Stage 4 — orquestrador consolida + escreve CHECKPOINT.md]
        ↓
[Claude retry do git commit original]
```

---

## Stages Detalhados

### Stage 1 — Compilação TypeScript (bloqueante)

Roda em paralelo via Task tool:
- `cd pool-intelligence-pro/backend && npx tsc --noEmit 2>&1`
- `cd pool-intelligence-pro/frontend && npx tsc --noEmit 2>&1`

**Falha:** qualquer erro de tsc → veredicto `❌ BLOQUEADO`, exibir erros, não prosseguir para Stage 2.

### Stage 2 — Testes + Build (bloqueante)

Roda em paralelo via Task tool:
- `cd pool-intelligence-pro/backend && npx vitest run 2>&1`
- `cd pool-intelligence-pro && npm run build 2>&1`

**Falha:** testes falhando (exit ≠ 0) ou build quebrado → veredicto `❌ BLOQUEADO`.

> **Permissão necessária:** adicionar `Bash(npx vitest run*)` ao `settings.json`.

### Stage 3 — Revisão Profunda (não-bloqueante individualmente)

5 agentes em paralelo via Task tool. **Regra crítica: nenhum agente escreve arquivos — todos retornam texto estruturado ao orquestrador.**

| Agente | Base | Responsabilidade |
|--------|------|-----------------|
| A | `verification-before-completion` | Verifica evidências dos Stages 1+2, captura warnings, exit codes |
| B | `requesting-code-review` | Compara implementação vs requisitos do CHECKPOINT.md |
| C | `simplify` *(skill do sistema)* | Analisa `git diff HEAD` por duplicações, over-engineering, eficiência |
| D | consolidador | Aplica `receiving-code-review` como critério: lê outputs de A+B+C, filtra falsos positivos com rigor técnico, retorna lista final de achados reais |
| E | audit interno | pt-review + antipatterns + conformidade (ver detalhes abaixo) |

**Agente E — detalhes:**

*pt-review* — scope restrito para evitar falsos positivos:
- Arquivos: `*.md` e somente comentários/strings em `*.ts`, `*.tsx` (não variáveis, não URLs)
- Padrões com word boundaries: ver `pt-patterns.txt`
- Exclusões: `node_modules/`, `dist/`, `.git/`, arquivos de lock

*antipatterns* — grep em `*.ts`, `*.tsx`:
- Ver `antipatterns.txt`

*conformidade* — verificação textual:
- `git log --oneline -5` vs última seção do CHECKPOINT.md
- Commits recentes devem ter correspondência na seção mais recente

**Agente D — protocolo de consolidação:**
1. Recebe outputs de A, B, C como texto
2. Aplica critério `receiving-code-review`: rejeita falsos positivos, exige evidências
3. Retorna lista final: `[CRÍTICO | IMPORTANTE | AVISO]` com arquivo:linha quando aplicável

### Stage 4 — Consolidação no CHECKPOINT.md

O orquestrador (Claude principal) recebe todos os outputs dos 5 agentes, consolida e **é o único responsável por escrever no CHECKPOINT.md**. Adiciona/substitui a seção `## Auditoria Pré-Commit`:

```markdown
## Auditoria Pré-Commit — YYYY-MM-DD HH:MM

| Verificação        | Resultado | Detalhes                        |
|--------------------|-----------|----------------------------------|
| tsc backend        | ✅/❌     | 0 erros / N erros               |
| tsc frontend       | ✅/❌     | 0 erros / N erros               |
| vitest             | ✅/❌     | N/N passando                    |
| build              | ✅/❌     | exit 0 / exit 1                 |
| verification       | ✅/⚠️/❌  | resumo de evidências            |
| code-review        | ✅/⚠️/❌  | N itens vs CHECKPOINT           |
| simplify           | ✅/⚠️/❌  | N achados no diff               |
| português          | ✅/⚠️     | N ocorrências (arquivo:linha)   |
| antipatterns       | ✅/⚠️/❌  | lista arquivo:linha             |
| conformidade       | ✅/⚠️     | commits vs CHECKPOINT alinhados |

**Veredicto: [✅ APROVADO | ⚠️ APROVADO COM AVISOS | ❌ BLOQUEADO]**

**Próximas ações (priorizadas):**
1. [CRÍTICO] arquivo:linha — descrição
2. [IMPORTANTE] arquivo:linha — descrição
3. [AVISO] arquivo:linha — descrição
```

---

## Vereditos

| Veredicto | Condição | Ação |
|-----------|----------|------|
| `✅ APROVADO` | Stages 1+2 passam, Stage 3 sem achados críticos/importantes | Commit prossegue |
| `⚠️ APROVADO COM AVISOS` | Stages 1+2 passam, Stage 3 tem apenas avisos | Commit prossegue, itens registrados |
| `❌ BLOQUEADO` | Stage 1 ou Stage 2 falha | Commit cancelado, erros exibidos |

---

## Hook PreToolUse — Especificação Exata

Em `.claude/settings.json`, adicionar:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys,json; d=json.load(sys.stdin); cmd=d.get('tool_input',{}).get('command',''); print('AUDITORIA OBRIGATÓRIA: execute /audit-review antes de commitar. O commit foi bloqueado.') or sys.exit(1) if 'git commit' in cmd else sys.exit(0)\""
          }
        ]
      }
    ]
  }
}
```

**Protocolo:**
- Claude Code entrega o input do Bash tool via **stdin como JSON** (ex: `{"command": "git commit -m '...'"}`)
- O script lê stdin com `json.load(sys.stdin)`, extrai o campo `command`
- Se contém `"git commit"` → imprime mensagem de bloqueio + `sys.exit(1)` → Bash tool bloqueado
- Caso contrário → `sys.exit(0)` → Bash tool prossegue normalmente
- Claude lê a mensagem de bloqueio, executa `/audit-review`, e ao final retenta o commit

---

## Arquivo `pt-patterns.txt` — Conteúdo Definido

```
# Padrões de erros de português com word boundaries
# Formato: REGEX|SUGESTÃO
\bnao\b|não
\bse nao\b|se não
\bmas nao\b|mas não
\btambem\b|também
\btb\b|também (informal)
\bvocê\b → OK (correto)
\bvoce\b|você
\besta\b(?! [a-z])|está
\bsera\b|será
\bpode ser\b → OK
\bConfiguracao\b|Configuração
\bconfiguracao\b|configuração
\bInformacao\b|Informação
\binformacao\b|informação
\bOperacao\b|Operação
\boperacao\b|operação
\bConexao\b|Conexão
\bconexao\b|conexão
\bAdicao\b|Adição
\badicao\b|adição
\bRemocao\b|Remoção
\bremocao\b|remoção
\bAtualizacao\b|Atualização
\batualizacao\b|atualização
```

---

## Arquivo `antipatterns.txt` — Conteúdo Definido

```
# Anti-patterns do projeto Pool Intelligence Pro
# Formato: REGEX|DESCRIÇÃO|SEVERIDADE
: any|TypeScript strict violado — nunca usar any sem justificativa|CRÍTICO
as any|TypeScript strict violado — cast para any|CRÍTICO
console\.log|Usar logService.info/warn/error em vez de console.log|IMPORTANTE
catch\s*\{\s*\}|Catch vazio — erro silenciado silenciosamente|CRÍTICO
catch\s*\(.*\)\s*\{\s*\}|Catch vazio com parâmetro — erro silenciado|CRÍTICO
// @ts-ignore|Supressão de erro TypeScript|IMPORTANTE
// @ts-nocheck|Supressão de checagem TypeScript no arquivo|CRÍTICO
TODO(?!.*#[0-9])|TODO sem número de issue (ex: TODO #123)|AVISO
setTimeout.*,\s*0\b|Anti-pattern de event loop com delay zero|AVISO
```

---

## Permissões Necessárias em `settings.json`

Adicionar às permissões existentes:
```json
"Bash(npx vitest run*)"
```

---

## Integração com Skills Existentes

A skill **orquestra** as existentes — não substitui:
- `verification-before-completion` → Agente A (standalone continua disponível)
- `requesting-code-review` → Agente B (standalone continua disponível)
- `simplify` → Agente C — **skill do sistema** (não é arquivo local; invocável via Skill tool; standalone continua disponível)
- `receiving-code-review` → critério do Agente D (standalone continua disponível)
- `/audit-review` → orquestrador automático pré-commit

---

## Critérios de Sucesso

- [ ] Intercepta `git commit` automaticamente antes de executar
- [ ] Stage 1+2 bloqueiam commit quando tsc ou testes falham
- [ ] Stage 3 roda os 5 agentes em paralelo, cada um retornando texto ao orquestrador
- [ ] Apenas Stage 4 (orquestrador) escreve no CHECKPOINT.md
- [ ] Resultado escrito com tabela formatada + lista priorizada de ações
- [ ] Falsos positivos no pt-review < 10% com os padrões definidos
- [ ] Tempo estimado: 40-90s (Stage 1+2 dominam; Stage 3 limitado por latência LLM)

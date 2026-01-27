# Instruções para o Claude

Este arquivo contém diretrizes para o Claude Code Assistant ao trabalhar neste repositório.

## Sobre o Projeto

Pool2026prm - Repositório gerenciado com assistência do Claude.

## Diretrizes Gerais

### Estilo de Código
- Escrever código limpo e bem documentado
- Seguir as convenções e padrões existentes no projeto
- Usar nomes de variáveis e funções descritivos

### Commits
- Escrever mensagens de commit claras e descritivas
- Fazer commits atômicos (uma mudança lógica por commit)
- Usar o padrão: `tipo: descrição breve`
  - Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Requests
- Incluir descrição clara das mudanças
- Referenciar issues relacionadas quando aplicável
- Garantir que todos os testes passem antes de solicitar review

### Issues
- Ao responder issues, ser claro e objetivo
- Fornecer exemplos de código quando útil
- Perguntar por mais contexto se necessário

## Como Usar o Claude

Mencione `@claude` em qualquer comentário de Issue ou Pull Request para obter assistência.

### Exemplos de Uso

- `@claude explique este código`
- `@claude como posso melhorar esta função?`
- `@claude ajude a corrigir este bug`
- `@claude revise este PR`

## Notas Importantes

- O Claude respeitará as permissões e configurações do repositório
- Respostas são geradas automaticamente via GitHub Actions
- Para configuração, verifique `.github/workflows/claude.yml`

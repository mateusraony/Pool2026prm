Analise o código do projeto Pool Intelligence Pro e sugira melhorias:

1. Leia os arquivos principais:
   - `pool-intelligence-pro/backend/src/index.ts`
   - `pool-intelligence-pro/backend/src/routes/index.ts`
   - `pool-intelligence-pro/backend/src/services/score.service.ts`
   - `pool-intelligence-pro/frontend/src/App.tsx`
   - `pool-intelligence-pro/frontend/src/api/client.ts`

2. Analise cada área:
   - **Performance**: N+1 queries, caching, bundle size
   - **Segurança**: inputs não validados, endpoints expostos, secrets
   - **Qualidade**: tipos any, error handling, código duplicado
   - **Arquitetura**: acoplamento, separação de responsabilidades
   - **DX**: scripts de dev, hot reload, debugging

3. Apresente uma tabela de melhorias organizadas por prioridade:
   | # | Área | Melhoria | Impacto | Esforço | Prioridade |
   Com recomendação de implementação por etapas.

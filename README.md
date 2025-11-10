# GYMii Smart Coach

Aplicativo web em React para organizar treinos, acompanhar evolução e importar templates prontos a partir de uma instância Supabase.

## Requisitos

- Node.js 18 ou superior
- npm 9+
- Supabase CLI (opcional, mas recomendado) – `npm i -g supabase` ou [instalação oficial](https://supabase.com/docs/guides/cli#installing)

## Configuração local

1. Instale as dependências:
   ```sh
   npm install
   ```
2. Crie um arquivo `.env` na raiz do projeto e preencha com as chaves do seu projeto Supabase:
   ```env
   VITE_SUPABASE_URL="https://<seu-projeto>.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="<public-anon-key>"
   ```
3. Inicie o servidor de desenvolvimento:
   ```sh
   npm run dev
   ```
4. Acesse `http://localhost:5173` (ou a porta exibida no terminal).

## Vinculando à Supabase

1. Faça login no Supabase CLI usando o token da sua conta:
   ```sh
   supabase login
   ```
2. Vincule o diretório atual ao projeto existente (substitua o ID pelo seu):
   ```sh
   supabase link --project-ref ilbqxysgnsxkvluvxkon
   ```
3. Aplique o esquema/migrations ao banco remoto:
   ```sh
   supabase db push
   ```
   Isso cria as tabelas `profiles`, `workouts`, `exercises`, `workout_templates` e garante as colunas opcionais (como `set_plan`) que o front-end consome.
4. Se precisar rodar as seeds localmente, use:
   ```sh
   supabase db reset
   ```
   > Atenção: o comando acima apaga dados locais; não use em produção.

## Execução de build e deploy

- Build de produção:
  ```sh
  npm run build
  ```
- Visualizar a build:
  ```sh
  npm run preview
  ```

Ao publicar em ambientes estáticos (GitHub Pages, Netlify, Vercel), garanta que as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` estejam configuradas no ambiente de build. Para o GitHub Pages, defina a opção `base` no `vite.config.ts` conforme o caminho do repositório antes de executar o build.

## Estrutura de pastas

- `src/` – código fonte do front-end em React + TypeScript
- `src/components/WorkoutDialog.tsx` – diálogo para criar/editar treinos
- `src/pages/Workouts.tsx` – tela principal de listagem, importação e gerenciamento dos treinos
- `src/lib/training.ts` – utilidades para interpretar planos de treino e template
- `supabase/migrations/` – esquema do banco e seed do template base

## Scripts úteis

- `npm run dev` – ambiente de desenvolvimento com Vite
- `npm run build` – build de produção
- `npm run preview` – serve os arquivos gerados em `dist/`
- `npm run lint` – validação com ESLint

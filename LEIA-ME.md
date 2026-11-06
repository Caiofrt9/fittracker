# FitTracker — como colocar no seu iPhone

Leva uns 20 minutos, no computador. Tudo nos planos gratuitos.

O que tem nesta pasta:
- `app/` — o aplicativo (é essa pasta que vai para a internet)
- `supabase/1-criar-tabelas.sql` — cria o banco de dados
- `supabase/2-importar-registros.sql` — traz o que você já registrou (pesagem de 01/11 e os treinos de 02, 03 e 04/11)

---

## 1. Criar o banco de dados (Supabase)

1. Entre em **supabase.com**, crie uma conta e clique em **New project**.
   - Dê um nome (ex.: `fittracker`), crie uma senha do banco (guarde) e escolha a região **South America (São Paulo)**.
   - Espere uns 2 minutos até o projeto ficar pronto.
2. No menu da esquerda, abra **SQL Editor** → **New query**.
3. Abra o arquivo `supabase/1-criar-tabelas.sql`, copie tudo, cole lá e clique em **Run**. Deve aparecer "Success".
4. Vá em **Authentication** → **Sign In / Providers** (ou **Providers**) → **Email** e **desligue "Confirm email"**. Assim você entra direto, sem precisar clicar em link no e-mail.
5. Vá em **Project Settings** → **API** (ou **Data API**) e copie:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - a chave **anon public** (ou **publishable**). Não use a chave "service_role"/"secret".

## 2. Conectar o app ao banco

Abra `app/config.js` num editor de texto (Bloco de Notas serve) e troque:

```js
supabaseUrl: "COLE_AQUI_A_PROJECT_URL",
supabaseAnonKey: "COLE_AQUI_A_CHAVE_ANON"
```

pelos valores que você copiou, mantendo as aspas. Salve.

## 3. Colocar o app no ar (Netlify)

1. Crie uma conta gratuita em **netlify.com** (com a conta o site fica no ar de forma permanente).
2. Abra **app.netlify.com/drop** e **arraste a pasta `app`** para a página.
3. Em segundos você recebe um endereço tipo `https://nome-aleatorio.netlify.app`.
4. Se quiser um nome melhor: **Site configuration** → **Change site name** (ex.: `fittracker-caio.netlify.app`).

## 4. Instalar no iPhone

1. No iPhone, abra o endereço no **Safari** (precisa ser o Safari).
2. Toque em **Compartilhar** (o quadrado com a seta) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra o app pelo ícone novo, toque em **Criar conta** e cadastre seu e-mail e senha.

## 5. Trazer os registros antigos

Depois de criar a conta no app: no Supabase, **SQL Editor** → **New query**, cole o conteúdo de `supabase/2-importar-registros.sql` e clique em **Run**. Feche e abra o app: a pesagem de 114,5 kg, a meta de 80 kg e os treinos da semana vão aparecer.

## 6. Opcional: fechar o cadastro

Como o app é só seu, depois de criar sua conta você pode ir em **Authentication** → **Sign In / Providers** e desligar **"Allow new users to sign up"**. Seus dados já são privados de qualquer forma; isso só impede que outras pessoas criem conta no seu app.

---

## Como usar

- **Início** — meta de 80 kg, peso atual, quanto já perdeu, treinos do mês, recordes de barras e flexões, e a semana colorida.
- **Treinar → Minhas rotinas** — monte rotinas com exercícios, séries (normal, A = aquecimento, F = falha), metas de repetições/carga e o descanso de cada exercício. Em **Iniciar rotina**, a coluna *Anterior* mostra o que você fez da última vez; toque em ✓ ao terminar cada série e o cronômetro de descanso começa sozinho (−15 / +15 / Pular). Se fechar o app no meio, o treino continua de onde parou.
- **Treinar → Registro rápido** — escolha o dia e o tipo. Em musculação/calistenia, adicione exercícios e anote cada série: repetições (ou segundos, no dead hang e na prancha) e carga extra em kg, se usar. Deixe a carga vazia para peso do corpo. "Repetir último treino" copia o treino anterior para você só ajustar os números.
- **Calendário** — dourado = muay thai, azul = musculação, vermelho = dia sem treino. Toque num dia para ver, editar ou apagar.
- **Evolução** — gráfico do peso com a linha da meta, e a evolução de cada exercício (recorde e melhor série de cada treino).
- **Ajustes** — mudar a meta e sair da conta.

Os recordes da tela inicial vêm dos exercícios **Barra pronada** e **Flexão**: use esses nomes para eles contarem.

## Atualizar o app depois

Se eu te mandar uma versão nova: substitua os arquivos da pasta `app` (mantendo o seu `config.js`), abra o site no Netlify → **Deploys** e arraste a pasta `app` de novo. No iPhone, feche e abra o app duas vezes para pegar a versão nova.

## Atualização das rotinas

Para as rotinas funcionarem, rode uma vez o arquivo `supabase/3-rotinas.sql` no SQL Editor do Supabase.

## Custos

- Supabase, plano gratuito: R$ 0 (o projeto pausa após 1 semana sem uso; se acontecer, é só entrar no supabase.com e clicar em "Restore").
- Netlify, plano gratuito: R$ 0.
- Domínio próprio (opcional): cerca de R$ 40/ano no Registro.br.

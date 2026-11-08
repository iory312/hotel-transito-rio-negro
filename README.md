# Hotel de Trânsito Rio Negro

Sistema interno de recepção do **Hotel de Trânsito Rio Negro**, alojamento oficial de trânsito da Marinha do Brasil. Não é um hotel comercial: não há motor de reservas público, canal de vendas nem integração com operadoras.

A aplicação é uma SPA estática (Vite + React). O banco operacional é Supabase/Postgres, com Auth e RLS. Se a URL e a chave não estiverem configuradas, a tela abre em **modo demonstração**: os dados ficam só no navegador e isso é avisado em todas as páginas.

## Requisitos

- Node.js 22 ou superior
- Projeto Supabase (para sair do modo demonstração)

## Rodar localmente

```bash
npm install
npm run dev
```

O servidor de desenvolvimento sobe em `http://127.0.0.1:4517`.

Sem `.env`, o login de demonstração é:

- e-mail: `recepcao@rionegro.mar.mil.br`
- senha: `Transito.RioNegro`

Esse acesso não conversa com o banco. Para a operação real, crie o `.env` como abaixo e entre com um usuário que esteja na tabela `staff`.

Testes de domínio (idade, diária, sobreposição, relatórios):

```bash
npm test
npm run build
```

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com). Anote a URL (`https://SEU-PROJETO.supabase.co`).
2. Em **Project Settings → API**, copie a chave **anon** (legado) ou a chave **publishable**. Não copie `service_role` nem `sb_secret`. Essa chave secreta ignora o RLS e não pode ir para o navegador. O aplicativo recusa a inicialização se detectar `service_role`.
3. Crie `.env` na raiz (ele não entra no git):

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable
```

A URL precisa ser HTTPS. `http://localhost` só é aceito para um Supabase local.

4. No **SQL Editor**, execute o arquivo inteiro:

`supabase/migrations/20261108120000_initial_schema.sql`

Ele cria as tabelas `rooms`, `guests`, `reservations`, `reservation_dependents`, `payments` e `profiles`, além de `staff` (quem pode operar) e `settings` (idade de isenção). Também:

- liga RLS em todas essas tabelas e revoga o papel `anon`;
- semeia os quartos **Quarto 01** a **Quarto 14**;
- grava a idade de isenção padrão **6**;
- impede overbooking com uma restrição de exclusão no banco (`reservations_no_overlap`), mesmo que duas gravações ocorram ao mesmo tempo;
- só aceita gravação de hóspede, reserva, dependente e pagamento pelas funções `save_stay`, `set_stay_status`, `add_payment`, `delete_payment` e `save_guest`.

Não há dado de militar na semente. Os exemplos de hóspede existem apenas no modo demonstração.

5. Execute em seguida:

`supabase/migrations/20261108164500_guest_register_room_active.sql`

Esse arquivo libera o cadastro de hóspede novo em `save_guest` (a função inicial só atualizava quem já existia), grava os dependentes do militar em `guest_dependents` e permite marcar a UH como inativa. Sem ele, a recepção não consegue cadastrar hóspede fora de uma reserva.

## Criar o primeiro usuário da recepção

O cadastro público não autoriza ninguém. Um login só lê o hotel depois de entrar em `staff`.

1. No painel: **Authentication → Users → Add user**. Informe e-mail e senha e confirme o e-mail.
2. Em **Authentication → Providers → Email**, desligue **Allow new users to sign up** se o projeto for só do hotel. A chave anon fica no navegador; sem esse desligamento, qualquer pessoa cria conta, mas continua sem ver dados até alguém inseri-la em `staff`.
3. No SQL Editor, autorize o usuário (troque o e-mail):

```sql
insert into public.staff (user_id)
select id
from auth.users
where email = 'recepcao@exemplo.mil.br'
on conflict (user_id) do nothing;
```

4. Reinicie `npm run dev` e entre com esse e-mail e senha. A tela **Sair** fica no topo, no celular e no desktop. Conta autenticada que não está em `staff` vê apenas o aviso de conta sem autorização.

O nome exibido na recepção fica em `profiles` e é editado em Administração. Cargo e permissão não são lidos de `user_metadata`.

## Regras de negócio

- A diária é um valor livre, informado em cada reserva. Não existe tabela de preços no sistema.
- Total = diária × noites × pagantes.
- O titular sempre paga.
- A idade do dependente é calculada na data de entrada. Idade menor ou igual à idade de isenção (padrão 6) é isenta. Idade maior paga.
- A saída não ocupa a noite: outro hóspede pode entrar no mesmo dia.
- Reserva cancelada libera o quarto. Check-out, ou cancelamento depois do check-in, marca o quarto para limpeza.
- Bloqueio de manutenção não tem hóspede nem diária.
- Pagamentos parciais abatem o total e mostram o saldo pendente.

## Telas

- **Mapa de reservas:** quartos à esquerda, dias no topo, estadias coloridas (livre, reservado, ocupado, limpeza, bloqueado, encerrada). **Nova reserva** fica no topo; um dia livre do quarto também abre a reserva. No celular, o calendário desliza na horizontal e a coluna do quarto fica fixa.
- **Reserva:** datas, quarto, diária digitada na estada, titular, dependentes, conta ao vivo, pagamentos, check-in, check-out, cancelamento e bloqueio.
- **Hóspedes:** lista, busca e **Novo hóspede** (nome, posto, NIP, OM, telefone e dependentes), com edição do cadastro.
- **Quartos:** as 14 UHs, com número, nome, notas, limpeza e ativo. UH inativa sai do mapa.
- **Relatórios:** entradas, saídas, quem está na casa, café da manhã e ocupação do mês.
- **Administração:** idade de isenção e nome da recepção.

## Publicar no GitHub Pages

O site público é só a recepção. Hóspede, NIP e estada continuam no Supabase, atrás do login e do RLS. O repositório público leva a chave **anon** (a mesma do navegador), nunca a `service_role`.

O endereço previsto é `https://iory312.github.io/hotel-transito-rio-negro/`. O roteamento é por hash (`/#/mapa`). O `base` do build de produção está em `.env.production` (`VITE_BASE_PATH=/hotel-transito-rio-negro/`). O `npm run dev` local continua na raiz.

O workflow `.github/workflows/pages.yml` gera `dist` e publica com GitHub Actions, no mesmo modelo do site de estudos. No repositório público: **Settings → Pages → Build and deployment → Source: GitHub Actions**. O `index.html` pede para os buscadores não indexarem a recepção.

## Segurança

- Sem sessão, a interface não mostra quarto, hóspede nem NIP.
- RLS e `staff` limitam a leitura ao pessoal autorizado. O papel `anon` não tem `GRANT` nas tabelas do hotel.
- A chave `service_role` não está no repositório nem é aceita pelo cliente.
- Textos de hóspede são renderizados como texto, sem HTML.
- A sobreposição é rejeitada na escrita, pela restrição do Postgres e pela mesma regra no modo demonstração.

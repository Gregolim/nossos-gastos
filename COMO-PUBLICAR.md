# Nossos Gastos: como testar, compartilhar e instalar no celular

O app é um **PWA** (site que vira aplicativo). É o mesmo código para computador, Android e iPhone.
Não precisa de loja de aplicativos nem de servidor pago.

## Arquivos do projeto

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura da tela |
| `style.css` | Visual (celular, computador e modo escuro) |
| `app.js` | Toda a lógica: contas, parcelas, gráficos, reservas |
| `firebase-config.js` | Configuração para compartilhar os dados entre o casal |
| `manifest.json`, `sw.js`, `icons/` | Permitem instalar como app e abrir sem internet |

---

## 1. Testar no computador (2 minutos)

Dê dois cliques em `index.html`. O app abre no navegador e já funciona,
com os dados salvos **só neste navegador**.

> Para testar como app instalável no PC, rode um servidor local na pasta:
> `npx serve .` e abra o endereço que aparecer (ex.: http://localhost:3000).

---

## 2. Compartilhar os dados entre vocês dois (Firebase, gratuito)

Sem isso, cada aparelho guarda os próprios dados. Com o Firebase, os dois veem as mesmas contas em tempo real.

1. Acesse https://console.firebase.google.com e entre com uma conta Google.
2. **Adicionar projeto** → dê um nome (ex.: `nossos-gastos`). O Google Analytics pode ser desativado.
3. Na tela do projeto, clique no ícone **`</>` (Web)** → dê um apelido → **Registrar app**.
   Ele mostra um bloco `const firebaseConfig = { apiKey: ..., ... }`.
4. Abra `firebase-config.js` e copie os valores (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) para dentro de `window.FIREBASE_CONFIG`.
5. No mesmo arquivo, troque `CODIGO_FAMILIA` por um código difícil de adivinhar,
   ex.: `casal-silva-8f3k2q9x`.
6. No menu do Firebase: **Criação → Firestore Database → Criar banco de dados**
   → escolha a região `southamerica-east1 (São Paulo)` → **modo de produção**.
7. Na aba **Regras** do Firestore, apague tudo, cole o texto abaixo
   (trocando pelo SEU código do passo 5) e clique em **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /familias/{codigo}/{documento=**} {
      allow read, write: if codigo == "casal-silva-8f3k2q9x";
    }
  }
}
```

8. Abra o app de novo. No topo deve aparecer **☁️ Sincronizado**.

> Se você já tinha lançado contas antes de configurar o Firebase: antes do passo 4, use
> ⚙️ → **Exportar backup**. Depois de configurar, use ⚙️ → **Importar backup**.

---

## 3. Salvar o projeto e publicar na internet (GitHub Pages, gratuito)

O celular só consegue instalar o app se ele estiver em um endereço **https**.
O GitHub guarda o projeto (backup e histórico) e publica o site de graça.

### Opção A: pelo site do GitHub (sem comandos)
1. Crie uma conta em https://github.com.
2. Clique em **New repository** → nome `nossos-gastos` → **Public** → **Create repository**.
3. Clique em **uploading an existing file** e arraste **todos os arquivos e a pasta `icons`**
   → **Commit changes**.
4. No repositório: **Settings → Pages** → em *Branch* escolha `main` e `/ (root)` → **Save**.
5. Em 1–2 minutos o endereço aparece no topo da página, algo como:
   `https://SEU-USUARIO.github.io/nossos-gastos/`

### Opção B: pelo terminal (Git)
```bash
cd "C:\Users\maiara.gregolim\Documents\CONTROLE DE GASTOS"
git init
git add .
git commit -m "Primeira versão do Nossos Gastos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/nossos-gastos.git
git push -u origin main
```
Depois ative o Pages como no passo 4 da opção A.

> ⚠️ Repositório público = código visível para qualquer pessoa, **inclusive o código da família**.
> Para o teste de vocês dois isso é aceitável. Antes de colocar dados sensíveis ou outras pessoas,
> o próximo passo é adicionar login (Firebase Authentication).

**Alternativa ainda mais rápida:** https://app.netlify.com/drop: crie uma conta e arraste a pasta inteira.

---

## 4. Instalar no celular

Abra o endereço do passo 3 no celular:

- **Android (Chrome):** menu **⋮** → **Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
- **Computador (Chrome/Edge):** ícone de instalar ⊕ na barra de endereço.

O ícone "R$" aparece na tela inicial e o app abre em tela cheia, como um aplicativo normal.
Na primeira vez ele pergunta **"Quem está usando?"**: cada um coloca o próprio nome.

---

## 5. Atualizar o app depois de mudar o código

1. Edite os arquivos.
2. Em `sw.js`, aumente a versão: `nossos-gastos-v1` → `nossos-gastos-v2`.
3. Envie de novo para o GitHub (upload ou `git add . && git commit -m "..." && git push`).
4. No celular, feche e abra o app (às vezes duas vezes) para pegar a versão nova.

---

## Como usar (resumo)

- **＋** adiciona uma conta: *Única*, *Parcelada* (ex.: geladeira em 10x, podendo começar na parcela 4)
  ou *Fixa* (água, luz, internet: repete todo mês).
- Toque no **círculo** para marcar como paga: fica **verde**.
  Vencida ou faltando **5 dias ou menos** para vencer: fica **vermelha**.
- **Contas:** navega por mês e filtra por categoria e por paga/a pagar.
- **Categorias:** escolha "Mercado", por exemplo, e veja quanto gastaram em cada mês, com gráfico e média.
- **Painel:** totais do mês, alertas, gráfico por categoria, últimos 6 meses e parcelas que faltam.
- **Reservas:** reserva de emergência e investimentos, com meta, depósitos, retiradas e histórico.
- **Sonhos:** metas do casal, da casa ou individuais, com ano e valor opcional. Ao conquistar,
  toque em **🏆 Conquistamos!** e anexe fotos (até 10 por sonho). Toque na foto para ver em tamanho grande ou baixar.
  As fotos são comprimidas e guardadas no Firestore (plano gratuito: 1 GB, milhares de fotos).
- **⚙️:** nome do casal, trocar usuário e fazer backup (o backup inclui as fotos).

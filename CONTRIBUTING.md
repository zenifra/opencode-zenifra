# Desenvolvimento e publicação

Este documento orienta a manutenção do plugin e sua distribuição aos clientes da Zenifra.
O fluxo de instalação e uso está no [README](./README.md).

## Ambiente local

- Node.js 22 ou superior.
- npm e Git.
- OpenCode V2 para validação de integração.
- Uma chave Zenifra de teste para validar inferência real.

```bash
npm ci
npm run check
```

O projeto usa módulos ECMAScript e JavaScript executável diretamente. Não há build nem
dependências de runtime. O Prettier é uma dependência de desenvolvimento, com versão
fixada e lockfile versionado.

## Organização

```text
src/
  catalog.js       Validação e conversão do catálogo para modelos OpenCode
  index.js         Registro do provedor, autenticação, cache e ciclo de atualização
  options.js       Opções, valores padrão e validação de configuração
test/
  plugin.test.js   Testes de catálogo e ciclo de vida com dependências simuladas
  options.test.js  Testes dos limites e opções de configuração
```

O nome interno do pacote é `@zenifra/opencode`, distribuído pelo GitHub. O ID do plugin é
`zenifra.models`, e o provedor é `zenifra`. Preserve esses IDs para manter a integração
com as credenciais e configurações existentes.

## Padrões de código

- Use nomes descritivos, módulos pequenos e comentários que expliquem decisões.
- Preserve o ID completo enviado à API; remova o prefixo somente do ID interno.
- Valide dados externos antes de substituir o catálogo atual.
- Mantenha timeout, prevenção de sobreposição e cancelamento no descarregamento.
- Use o gerenciamento de credenciais do OpenCode para inferência.
- Não faça consultas autenticadas ao endpoint público de descoberta.
- Mantenha mensagens de erro existentes úteis para diagnóstico.

```bash
npm run format
npm run check
```

## Testes

```bash
npm test
```

Os testes não usam credenciais, não dependem da API pública e não geram inferência paga.
As dependências de rede, agendamento e logs são injetadas pela função `createPlugin`.
O relógio real é usado somente no teste do timeout de uma consulta.

Cubra conversão de metadados, IDs duplicados, preços, opções inválidas, cache, falhas de
rede, recuperação após falha, recarga do provedor e cancelamento de requisições.

### Validação no OpenCode

Configure a instalação local descrita no README. Em uma instalação sem cadastro anterior
da Zenifra, confira:

1. A integração aparece em `/connect`.
2. É possível conectar e selecionar uma chave válida.
3. `ZENIFRA_API_KEY` funciona no ambiente do servidor, sem conta salva concorrente.
4. Os modelos aparecem em `/models`.
5. Uma conversa curta, uma chamada de ferramenta e uma variante de raciocínio funcionam.
6. Uma chave inválida não permite inferência.
7. A perda temporária do endpoint preserva o catálogo anterior.

Testes unitários e a presença do modelo no seletor não comprovam o funcionamento da
inferência. Registre separadamente os resultados da validação real antes de uma release.

## Publicar no GitHub da Zenifra

Repositório: **[zenifra/opencode-zenifra](https://github.com/zenifra/opencode-zenifra)**.
O código é distribuído diretamente pelo GitHub.

1. Crie um repositório público e vazio na organização.
2. Confirme o nome definitivo e atualize as URLs do README, deste guia e os metadados
   `repository`, `homepage` e `bugs` do `package.json` conforme o repositório real.
3. Execute `npm ci` e `npm run check`.
4. Na cópia local ainda não versionada:

```bash
git init
git add .
git commit -m "feat: add Zenifra provider plugin for OpenCode V2"
git branch -M main
git remote add origin https://github.com/zenifra/opencode-zenifra.git
git push -u origin main
```

Se o projeto já estiver versionado, use o repositório e remoto existentes. O `.gitignore`
exclui `node_modules`, arquivos `.env`, cobertura e pacotes `.tgz`.

Após o push, valide a instalação pelo GitHub em um ambiente limpo:

```bash
opencode plugin add github:zenifra/opencode-zenifra
```

Para criar a primeira tag, depois de validar a versão `0.1.0`:

```bash
git tag -a v0.1.0 -m "Zenifra OpenCode plugin v0.1.0"
git push origin v0.1.0
```

Crie uma release no GitHub com o resumo das mudanças e o procedimento de instalação.
A instalação pelo GitHub não exige publicação no npm.

## Distribuição somente pelo GitHub

O `package.json` mantém `private: true` para impedir publicação acidental no registro npm.
Isso não torna o repositório GitHub privado e não impede sua instalação por referência Git.
Os comandos npm deste projeto são ferramentas locais de desenvolvimento e empacotamento.

`npm pack` pode ser usado para inspecionar o artefato local; `prepack` executa `npm run check`.
Não há automação de publicação ou criação de releases.

## Próximas versões

1. Atualize código, testes e documentação.
2. Execute `npm run check` e a validação de integração necessária.
3. Atualize `version` no `package.json` e no `package-lock.json`.
4. Crie um commit e uma tag correspondentes à versão.
5. Envie o commit e a tag ao GitHub e escreva as notas da release.

Uma mudança no catálogo da Zenifra não exige uma nova versão do plugin quando o formato
da API permanece compatível: a descoberta periódica já atualiza os modelos.

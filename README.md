# Zenifra para OpenCode

**Use os modelos de IA da Zenifra no OpenCode V2, com autenticação integrada e catálogo atualizado automaticamente.**

O plugin conecta o OpenCode à API compatível com OpenAI da Zenifra. Os modelos são
descobertos diretamente em [`ai.zenifra.com/v1/models`](https://ai.zenifra.com/v1/models),
com seus limites de contexto, suporte a ferramentas, modalidades e variantes de raciocínio.

| Recurso                             | Suporte                                              |
| ----------------------------------- | ---------------------------------------------------- |
| OpenCode                            | V2                                                   |
| Protocolo de inferência             | OpenAI-compatible Chat Completions                   |
| Autenticação                        | Chave de API ou `ZENIFRA_API_KEY`                    |
| Descoberta de modelos               | Ao carregar o plugin e, por padrão, a cada 5 minutos |
| Cache                               | Persistente, gerenciado pelo OpenCode                |
| Dependências de execução adicionais | Nenhuma                                              |
| Licença                             | MIT                                                  |

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Autenticação](#autenticação)
- [Escolher e usar modelos](#escolher-e-usar-modelos)
- [Configuração](#configuração)
- [Como funciona](#como-funciona)
- [Atualizar e desinstalar](#atualizar-e-desinstalar)
- [Solução de problemas](#solução-de-problemas)
- [Desenvolvimento e publicação](#desenvolvimento-e-publicação)
- [Referências](#referências)

## Pré-requisitos

1. **OpenCode V2** instalado e funcionando.
2. Uma **chave de API da Zenifra**, com acesso aos modelos desejados.
3. Acesso HTTPS a `ai.zenifra.com` a partir da máquina que executa o servidor OpenCode.

Para instalar pelo GitHub, tenha também Git disponível no ambiente do OpenCode.
Node.js e npm são necessários para desenvolver e publicar este projeto; o plugin não
exige que o usuário execute `npm install` manualmente.

## Instalação

O plugin é distribuído diretamente pelo repositório
[`zenifra/opencode-zenifra`](https://github.com/zenifra/opencode-zenifra), no GitHub.
Não é necessário instalar ou publicar um pacote no registro npm.

### Pelo GitHub

Execute no terminal:

```bash
opencode plugin add github:zenifra/opencode-zenifra
```

O comando adiciona o plugin à configuração global. Para fixar uma versão, use uma tag
que exista no repositório:

```bash
opencode plugin add 'github:zenifra/opencode-zenifra#v0.1.0'
```

Use o comando com a versão **em lugar** do comando sem versão, para manter uma única
entrada do plugin.

### A partir de uma cópia local

Clone o repositório:

```bash
git clone https://github.com/zenifra/opencode-zenifra.git
```

Também é possível usar diretamente uma cópia recebida do código. Adicione o caminho
**absoluto do diretório do pacote** à configuração do OpenCode:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/caminho/absoluto/opencode-zenifra"],
}
```

O diretório deve conter `package.json` e `src/`. Não há etapa de compilação.

### Confirmar a instalação

```bash
opencode plugin list
```

Abra o OpenCode e execute `/connect`. A opção **Zenifra** deve estar disponível.
Se você tinha uma cópia antiga em `~/.config/opencode/plugins/zenifra/`, mantenha apenas
uma instalação para evitar registros duplicados.

## Autenticação

### Pela interface do OpenCode

1. Execute `/connect`.
2. Selecione **Zenifra**.
3. Escolha a autenticação por chave, caso seja solicitado.
4. Informe sua chave de API da Zenifra.
5. Execute `/models` para escolher um modelo.

A chave fica sob o gerenciamento de credenciais do OpenCode. Ela não precisa ser
inserida no `opencode.jsonc`.

### Pelo terminal

Em um terminal interativo:

```bash
opencode auth login zenifra --method key
```

Confira as conexões cadastradas:

```bash
opencode auth list
```

### Por variável de ambiente

Para iniciar uma instância independente com a chave no ambiente:

```bash
export ZENIFRA_API_KEY="SUA_CHAVE_ZENIFRA"
opencode --standalone
```

Para o serviço compartilhado gerenciado pelo OpenCode:

```bash
opencode service set env ZENIFRA_API_KEY "SUA_CHAVE_ZENIFRA"
opencode auth list
```

O comando `service set env` para o serviço em execução; o próximo comando do OpenCode
o inicia com o novo ambiente. Em servidores remotos ou contêineres, configure a variável
no processo **do servidor**, que realiza as chamadas à API.

Uma conta salva no OpenCode tem precedência sobre a conexão por variável de ambiente.
Para remover a variável do serviço gerenciado:

```bash
opencode service unset env ZENIFRA_API_KEY
```

## Escolher e usar modelos

### Na sessão atual

Execute `/models` e selecione uma entrada do provedor **Zenifra**. A seleção vale para
a sessão atual.

O catálogo é dinâmico. Os IDs abaixo são exemplos: confirme a disponibilidade atual
no seletor antes de utilizá-los.

### Em uma execução pelo terminal

```bash
opencode run --model zenifra/deepseek-v4-pro "Explique a estrutura deste projeto."
```

### Com uma variante de raciocínio

Quando o modelo anunciar a variante `high`:

```bash
opencode run --model 'zenifra/deepseek-v4-pro#high' "Revise este código e identifique possíveis bugs."
```

As variantes vêm de `capabilities.reasoning.effort_levels` no catálogo. Elas não são
iguais para todos os modelos. O plugin envia a variante escolhida no campo
`reasoning_effort` da requisição.

### Como padrão para novas sessões

Exemplo de `opencode.jsonc` usando a instalação pelo GitHub:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:zenifra/opencode-zenifra"],
  "model": "zenifra/deepseek-v4-pro",
}
```

Se você usa uma cópia local, mantenha esse mesmo caminho na entrada
`plugins`. Não adicione outra instalação apenas para escolher o modelo padrão.

O campo global `model` do V2 não preserva a variante `#high`. Escolha a variante no
seletor ou com `--model` em uma execução.

## Configuração

### Onde colocar as opções

| Escopo            | Arquivo                                                          |
| ----------------- | ---------------------------------------------------------------- |
| Todos os projetos | `~/.config/opencode/opencode.jsonc`                              |
| Projeto atual     | `opencode.jsonc` ou `.opencode/opencode.jsonc` dentro do projeto |

Se `XDG_CONFIG_HOME` estiver definido, a configuração global fica em
`$XDG_CONFIG_HOME/opencode/opencode.jsonc`.

O OpenCode também aceita `.json`. Mescle os exemplos com o conteúdo existente e
configure as opções na entrada do plugin que você já utiliza.

### Exemplo completo

Neste exemplo, o catálogo é atualizado a cada dez minutos, com até vinte segundos
para cada consulta:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:zenifra/opencode-zenifra",
      "options": {
        "refreshIntervalMs": 600000,
        "timeoutMs": 20000,
      },
    },
  ],
  "model": "zenifra/deepseek-v4-pro",
}
```

O valor de `package` também pode ser uma referência GitHub com tag ou o caminho absoluto
da cópia local.

### Opções disponíveis

| Opção               | Tipo    | Padrão       | Descrição                                                                                  |
| ------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------ |
| `refreshIntervalMs` | Inteiro | `300000`     | Intervalo entre consultas do catálogo, em milissegundos.                                   |
| `timeoutMs`         | Inteiro | `15000`      | Tempo máximo de uma consulta do catálogo, em milissegundos.                                |
| `pricingCurrency`   | `"USD"` | Não definido | Habilita a importação de preços, mediante confirmação de que a API publica valores em USD. |

Os tempos aceitam valores entre `1000` e `2147483647`. Opções desconhecidas ou inválidas
são rejeitadas ao carregar o plugin. `timeoutMs` controla a **descoberta de modelos**;
não altera o tempo limite das respostas de inferência.

### Preços e estimativas de custo

O formato de custos do OpenCode exige **USD por milhão de tokens**. Como a resposta do
endpoint consultada durante o desenvolvimento não declara a moeda, o plugin deixa os
custos sem especificação por padrão.

Se houver confirmação da Zenifra de que os preços retornados estão em USD, configure:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:zenifra/opencode-zenifra",
      "options": {
        "pricingCurrency": "USD",
      },
    },
  ],
}
```

Essa opção não converte moedas. São importados os preços de entrada, saída e cache,
incluindo as faixas de contexto anunciadas. Descontos por horário não são representados.
Um custo sem especificação no plugin **não significa que o modelo seja gratuito**.
As estimativas do OpenCode não substituem os valores cobrados pela Zenifra.

## Como funciona

```text
OpenCode V2
  └─ Plugin zenifra.models
       ├─ Registra a autenticação da Zenifra
       ├─ Recupera o último catálogo válido do cache
       ├─ Consulta GET https://ai.zenifra.com/v1/models
       ├─ Atualiza os modelos quando os metadados mudam
       └─ Repete a consulta no intervalo configurado

Inferência → runtime OpenAI-compatible → https://ai.zenifra.com/v1
```

- **Catálogo público:** a consulta de modelos não envia a chave de inferência.
- **Cache persistente:** o armazenamento pertence ao plugin e é gerenciado pelo OpenCode.
- **Falhas temporárias:** erros HTTP, timeout e respostas inválidas preservam o último catálogo válido.
- **Primeira execução sem rede:** se não houver cache, os modelos serão carregados após uma consulta bem-sucedida.
- **Falha ao salvar o cache:** o catálogo obtido continua disponível na instância atual.
- **Atualização controlada:** consultas não se sobrepõem e catálogos idênticos não recarregam o provedor.
- **Encerramento:** ao descarregar o plugin, o timer é removido e consultas pendentes são canceladas.

### Capacidades e compatibilidade

O plugin usa Chat Completions. Modelos explicitamente exclusivos de outras operações,
como embeddings, são ignorados. Modelos sem `supported_operations` são tratados como
compatíveis com Chat Completions, seguindo o catálogo atual.

Limites, ferramentas, imagens e outras modalidades são mapeados a partir dos metadados
publicados pela API. O uso efetivo de uma modalidade também depende do runtime do OpenCode.
Modelos com raciocínio anunciado usam o campo `reasoning_content`.

O ID de API é preservado. Por exemplo, o modelo `zenifra/deepseek-v4-pro` recebe o ID
interno `deepseek-v4-pro` sob o provedor `zenifra`, evitando um prefixo duplicado no seletor.

## Atualizar e desinstalar

### Instalação pelo GitHub

```bash
opencode plugin check
opencode plugin update github:zenifra/opencode-zenifra
```

Para remover:

```bash
opencode plugin remove github:zenifra/opencode-zenifra
```

Use o mesmo identificador configurado na instalação. Commits Git
fixados não são atualizados automaticamente; altere a referência quando quiser migrar.
Em uma instalação local, atualize o código e remova a entrada de `plugins` para desinstalar.

Os modelos novos chegam pela API. Atualizar o pacote é necessário quando muda o código
do plugin, não a cada alteração no catálogo.

## Solução de problemas

| Sintoma                                    | O que verificar                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Zenifra não aparece em `/connect`          | Confirme o OpenCode V2, execute `opencode plugin list` e verifique o caminho ou pacote configurado.           |
| O GitHub não encontra o repositório        | Confirme o endereço `zenifra/opencode-zenifra` e o acesso à rede.                                             |
| Zenifra aparece, mas não há modelos        | Confira a autenticação, a conexão do servidor com o endpoint e possíveis erros de descoberta nos logs.        |
| A variável de ambiente não é reconhecida   | Configure-a no servidor OpenCode; exportar no terminal não muda o ambiente de um serviço que já está rodando. |
| Uma conta antiga continua sendo utilizada  | Contas salvas têm precedência sobre a variável de ambiente; selecione a conta desejada em `/connect`.         |
| A API retorna `401` ou `403` na inferência | Confira a chave e o acesso da conta ao modelo solicitado.                                                     |
| Uma variante não aparece                   | Confira as variantes anunciadas para aquele modelo em `/models`.                                              |
| O catálogo parece desatualizado            | Aguarde o intervalo de atualização e verifique se houve falha HTTP, timeout ou metadados inválidos.           |
| Erro de opção desconhecida                 | Use apenas as opções documentadas na tabela de configuração.                                                  |

O log normalmente fica em `~/.local/share/opencode/log/opencode.log`. Avisos do plugin
contêm o prefixo `Zenifra`. Você pode conferir a resposta pública diretamente:

```bash
curl --fail --show-error https://ai.zenifra.com/v1/models
```

Se uma mudança local não tiver sido recarregada, reinicie o serviço em um momento adequado:

```bash
opencode service restart
```

Para relatar um problema, inclua a versão do OpenCode, a versão do plugin, o ID do modelo,
o comportamento esperado e o erro observado. Não inclua chaves de API ou cabeçalhos de autenticação.

## Desenvolvimento e publicação

O código e as versões são distribuídos pela organização da **Zenifra no GitHub**.
A instalação direta pelo GitHub é suportada pelo OpenCode. O `package.json` é necessário
para identificar e carregar o plugin; sua presença não implica publicação no npm.

Para desenvolver, use Node.js 22 ou superior:

```bash
npm ci
npm run check
npm run pack:checked
```

- `npm run format`: aplica a formatação padrão.
- `npm run check`: verifica a formatação e executa os testes.
- `npm run pack:checked`: executa as verificações e gera o pacote `.tgz`.

Consulte [CONTRIBUTING.md](./CONTRIBUTING.md) para a estrutura do código, testes locais,
validação de inferência e o fluxo de publicação de versões no GitHub.

## Referências

- [Configuração do OpenCode V2](https://opencode.ai/v2/docs/config)
- [Instalação e gerenciamento de plugins](https://opencode.ai/v2/docs/plugins)
- [API de plugins](https://opencode.ai/v2/docs/build/plugins)
- [Autenticação de provedores](https://opencode.ai/v2/docs/cli/providers)
- [Seleção e configuração de modelos](https://opencode.ai/v2/docs/models)
- [Catálogo público da Zenifra](https://ai.zenifra.com/v1/models)

## Licença

Distribuído sob a [licença MIT](./LICENSE).

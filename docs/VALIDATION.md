# Validação do plugin

## Ambiente e escopo

- Data: 28 de setembro de 2026.
- OpenCode: **2.0.18**, Linux.
- Execução com diretórios, configuração, banco e serviço de teste isolados.
- Instalação a partir do GitHub, sem reaproveitar o plugin local.
- Catálogo público consultado: `https://ai.zenifra.com/v1/models`.

## Resultados

| Cenário                | Resultado observado                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Instalação pelo GitHub | Plugin instalado e registro `zenifra.models` carregado pelo OpenCode.                                            |
| Autenticação ausente   | Nenhum modelo Zenifra disponível antes da conexão no ambiente limpo.                                             |
| Integração             | Métodos de chave e `ZENIFRA_API_KEY` registrados.                                                                |
| Login interativo       | `opencode auth login zenifra --method key` recebeu uma chave em terminal PTY e cadastrou a conexão.              |
| Seletores da TUI       | `/connect` e `/models` exibiram Zenifra em um terminal PTY.                                                      |
| Chave inválida         | Inferência recusada com `provider.auth`, HTTP 401; nenhuma resposta de sucesso do assistente.                    |
| Catálogo               | Os 13 IDs anunciados pelo endpoint foram encontrados com os limites e capacidades correspondentes.               |
| Texto                  | Qwen3.8 Flash respondeu exatamente ao marcador solicitado.                                                       |
| Variante               | DeepSeek V4 Pro respondeu ao marcador; a requisição enviada continha `reasoning_effort: high`.                   |
| Ferramentas            | Qwen3.8 Flash executou uma chamada `read`, leu um arquivo de teste e retornou exatamente seu marcador aleatório. |
| Variável de ambiente   | Uma instalação separada, sem chave cadastrada, respondeu usando `ZENIFRA_API_KEY` e `--standalone`.              |
| Opções e modelo padrão | Configuração em objeto carregada; modelo padrão resolvido pelo OpenCode.                                         |
| Atualização            | `plugin check` e `plugin update` executados preservando as opções configuradas.                                  |
| Remoção                | Entrada removida do arquivo de configuração e plugin ausente da lista de plugins carregados.                     |
| Ambiente do serviço    | `service set env`, `service get env` e `service unset env` verificados com valor fictício.                       |

## Defeito encontrado e corrigido

A instalação original pelo GitHub falhava com `git dep preparation failed`. O script
`prepack` acionava a preparação de dependências Git; no executável testado, o subprocesso
de instalação do npm era encaminhada incorretamente ao CLI do OpenCode.

O pacote passou a distribuir seu JavaScript sem scripts de lifecycle. A verificação de
empacotamento agora é explícita: `npm run pack:checked`. A instalação real foi repetida
após a correção, além de receber um teste de regressão do contrato do pacote.

## Evidência e repetição

```bash
npm ci
npm run check
npm run test:e2e
```

O teste E2E conserva os resultados de comandos no diretório temporário impresso e
encerra somente o processo de serviço que ele próprio criou. Usa espera limitada por
estado observável, pois as primeiras respostas da API podem preceder o carregamento
dos plugins. Credenciais reais não fazem parte dos testes versionados nem dos exemplos.

## Limites da validação

- A listagem dos 13 modelos foi conferida; inferência real cobriu Qwen3.8 Flash e
  DeepSeek V4 Pro, não cada modelo individualmente.
- A variante `high` foi comprovada no payload enviado e aceita na inferência; isso não
  permite inspecionar ou comprovar o raciocínio interno do modelo.
- Falhas de rede, cache, concorrência, cancelamento, opções e preços são cobertas pelos
  testes locais. Nenhum desconto ou faturamento real foi validado.
- A moeda do catálogo não é presumida: custos continuam sem especificação por padrão.
- Não foram testadas outras versões do OpenCode ou outros sistemas operacionais.

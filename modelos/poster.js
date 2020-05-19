const { Client } = require('pg');
const sha256 = require('js-sha256');

class Post {

    /**
     * 
     * @param {Client} db 
     */
    constructor(db){

        this.db = db

    }

    /**
     * Executa query :/
     * 
     * @param {String} query query a ser realizado
     * @returns {Object[] | false} resposta à requisição
     */
    async executaQuery(query){

        let promise = new Promise(
         
            (solve, reject) => {

                this.db.query(query, (erro, resposta) => {

                    if(erro){
                        console.log("[ ERRO ]  "+erro.message)
                        reject(erro)
                    }
                    else solve(resposta)

                } )

            }
        )

        try {
            const resposta = await promise;
            return resposta;
        }
        catch (_) {
            return false;
        }

    }

    async listaTabela(tabela){

        let query = `select * from ${tabela}`

        let resposta = await this.executaQuery(query);

        return resposta ? resposta.rows : false
        
    }

       /**
     * 
     * Realiza uma busca numa tabela
     * 
     * @param {String} tabela tabela investigada
     * @param {Object} condicoes condições a serem satisfeitas
     * @param {String | Number} condicoes.* 
     * @returns {Object[] | false} resultado da busca
     */
    async busca(tabela, condicoes){

        let dadosParaCondicao = this.parseDadosParaWhere(condicoes)

        let query = `select * from ${tabela} where ${dadosParaCondicao}`

        let resposta = await this.executaQuery(query);

        return resposta && resposta.rowCount ? resposta.rows : false;


    }

     /**
     * 
     * Manipula dados para serem usados em inserção
     * 
     * @param {Object} dados dados to parse
     * @param {String | Number} dados.*
     * @returns {String} string para inserção
     */
    parseDadosParaInsert(dados){

        
        let colunas = ''
        let valores = ''

        for(let key in dados){

            colunas += key + ','

            valores += key == "senha" 
                ? `'${sha256(dados[key])}',`
                : `'${dados[key]}',`

        }

        

        return `(${colunas.substring(0, colunas.length - 1)}) values (${valores.substring(0, valores.length - 1)})`


    }

    /**
     * 
     * Gera strings com key = valor
     * 
     * @param {Object} dados dados to parse
     * @param {String | Number} dados.*
     * @returns {String[]} lista de strings com igualdades
     */
    juntaDadosEmIgualdades(dados){

        let elementos = []

        for(let key in dados){

            let sent

            if(key == 'senha') sent = `senha = '${sha256(dados[key])}'`

            else if( typeof dados[key] == 'number') sent = `${key} = ${dados[key]}`

            else sent = `${key} = '${dados[key]}'`

            elementos.push(sent)

        }

        return elementos

    }

    /**
     * 
     * Manipula dados para serem usados em updates
     * 
     * @param {Object} dados dados to parse
     * @param {String | Number} dados.*
     * @returns {String} string para update
     */
    parseDadosParaUpdate(dados){
        
        let elementos = this.juntaDadosEmIgualdades(dados)

        return elementos.join()

    }

    /**
     * 
     * Manipula dados para serem usados em condições
     * 
     * @param {Object} dados dados to parse
     * @param {String | Number} dados.*
     * @returns {String} string para condição
     */
    parseDadosParaWhere(dados){

        let elementos = this.juntaDadosEmIgualdades(dados)

        return elementos.join(" and ")

    }


    
    /**
     * 
     * Insere numa tabela retornando o id da linha inserida
     * 
     * @param {String} tabela tabela da inserção
     * @param {Object} dados dados a serem inseridos
     * @param {String | Number} dados.*
     * @returns {Number} resposta da requisição
     */
    async insere_get_id(dados, tabela){

        let dadosParaInsercao = this.parseDadosParaInsert(dados)

        let query = `insert into ${tabela} ${dadosParaInsercao} returning id_${tabela}`

        let resposta = await this.executaQuery(query);


        return resposta ? resposta.rows[0]["id_" + tabela] : false

    }
    

    async insere(dados, tabela){

        let erros = {

            funcionario : 'Já existe um funcionário usando este nome de usuário',

            cliente : 'Já existe um cliente registrado com este cpf',

            produto :  'Já existe um produto registrado com este código',

            fornecedor :'Já existe um fornecedor registrado com esse nome',
    
        }


        let query = `insert into ${tabela} ${this.parseDadosParaInsert(dados)}`
     
        let resultado = await this.executaQuery(query)

        return resultado ? "Ok" : erros[tabela]

    }

    async executa_insere(dados, tabela){

        console.log("[ PST ]  Inserindo " + tabela);

        return await this.insere(dados, tabela)

    }



    async pegaIdDoClientePeloCpf(cpf){

        let resultado = await this.busca("cliente", {cpf_cliente : cpf})

        return resultado ? resultado[0].id_cliente :  false

    }
    
    async executa_compra(dados){

        console.log("[ PST ] Realizando Compra");
      
        return !dados.cpf

        ? await this.finalizaCompra(dados, 1)

        : await this.finalizaCompra(dados, await this.pegaIdDoClientePeloCpf(dados.cpf))



    }

    async insereItensDaCompra(itens, idCompra){

        let queries = ''

        for(let item of itens)

        queries += 
            `insert into item_compra (quantidade, id_produto, id_compra)
                values(${item.quantidade},${item.id_produto}, ${idCompra});
            update produto set estoque = estoque - ${item.quantidade} where id_produto = ${item.id_produto};`                  

        let resposta = await this.executaQuery(queries);

        return resposta ? "Ok" : "Erro na inserção dos itens";
    

    }

    async finalizaCompra(data, cliente_id){

        let dadosInsert = {

            id_funcionario : data.id_funcionario,
            valor_compra : data.valor_compra,
            metodo_pagamento : data.metodo_pagamento,
            id_cliente : cliente_id

        }
        

        let idCompra = await this.insere_get_id(dadosInsert, "compra")

        return idCompra

        ? await this.insereItensDaCompra(data.itens, idCompra)
        : "Erro na criação da compra"


    }
    
    async login(dadosDoUsuario){

        let resultado = await this.busca("funcionario", dadosDoUsuario)

        return resultado ? resultado[0] : false

    }

    async executa_login(dados){

        console.log('[ PST ]  Realizando Login')

        return await this.login(dados)

    }

    async adicionaItensDeEntradaDeEstoque(itens, idEntrada){

        let queries = ''

        for(let item of itens)

        queries += 
            `insert into item_entrada_estoque (quantidade, id_produto, id_entrada_estoque)
                values(${item.quantidade},${item.id_produto}, ${idEntrada});
            update produto set estoque = estoque + ${item.quantidade} where id_produto = ${item.id_produto};`                  
                    
        let resposta = await this.executaQuery(queries);

        return resposta ? "Ok" : "Erro na inserção dos itens";


    }

    async entradaEstoque(funcionario, entregador, itens){

        let dadosParaInsercao = {
            id_funcionario : funcionario,
            id_entregador : entregador
        }

        let idEntrada = await this.insere_get_id(dadosParaInsercao, "entrada_estoque")

        return idEntrada

        ? await this.adicionaItensDeEntradaDeEstoque(itens, idEntrada)
        : "Erro na criação de entrada de estoque"


    }

    async executa_entrada_estoque(dados){

        console.log("[ PST ] Adicionando produtos ao estoque");

        return await this.entradaEstoque(dados.id_funcionario, dados.id_entregador, dados.itens)

    }

}

module.exports = {loadPoster : db => new Post(db)}
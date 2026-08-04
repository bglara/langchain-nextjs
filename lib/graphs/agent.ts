import {
	StateGraph,
	START,
	END,
	MessagesAnnotation,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { llm } from "@/lib/llm";
import { getRetriever } from "@/lib/rag";
import { SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";



/**
 * Parser recursivo descendente: entende SÓ números, + - * / e parênteses.
 * Qualquer outro caractere é rejeitado antes de qualquer processamento.
 * Nada aqui executa código — só percorre a string e faz aritmética.
 */
function avaliarExpressao(entrada: string): number {
	const texto = entrada.replace(/\s+/g, "");

	// A primeira linha de defesa: lista de permissão de caracteres.
	if (!/^[0-9+\-*/().]+$/.test(texto)) {
		throw new Error("A expressão contém caracteres não permitidos.");
	}

	let pos = 0;

	// expressão := termo (('+' | '-') termo)*
	function expressao(): number {
		let valor = termo();
		while (
			pos < texto.length &&
			(texto[pos] === "+" || texto[pos] === "-")
		) {
			const op = texto[pos++];
			const direita = termo();
			valor = op === "+" ? valor + direita : valor - direita;
		}
		return valor;
	}

	// termo := fator (('*' | '/') fator)*    ← multiplicação antes de soma
	function termo(): number {
		let valor = fator();
		while (
			pos < texto.length &&
			(texto[pos] === "*" || texto[pos] === "/")
		) {
			const op = texto[pos++];
			const direita = fator();
			if (op === "/" && direita === 0)
				throw new Error("Divisão por zero.");
			valor = op === "*" ? valor * direita : valor / direita;
		}
		return valor;
	}

	// fator := número | '(' expressão ')' | '-' fator
	function fator(): number {
		if (texto[pos] === "(") {
			pos++;
			const valor = expressao();
			if (texto[pos] !== ")") throw new Error("Parêntese não fechado.");
			pos++;
			return valor;
		}

		if (texto[pos] === "-") {
			pos++;
			return -fator();
		}

		const inicio = pos;
		while (pos < texto.length && /[0-9.]/.test(texto[pos])) pos++;
		if (inicio === pos) throw new Error("Número esperado.");
		return parseFloat(texto.slice(inicio, pos));
	}

	const resultado = expressao();
	if (pos !== texto.length) throw new Error("Expressão inválida.");
	return resultado;
}

const calculator = tool(
	async ({ expression }) => {
		console.log("[TOOL] calculator:", expression);
		try {
			return String(avaliarExpressao(expression));
		} catch (erro) {
			// Devolvemos o erro como texto em vez de lançar: assim o modelo
			// vê o que deu errado e pode tentar corrigir a expressão.
			return `Erro ao calcular: ${(erro as Error).message}`;
		}
	},
	{
		name: "calculator",
		description:
			"Avalia uma expressão aritmética simples, tipo '12 * 4 + 1'. " +
			"Aceita apenas números, + - * / e parênteses.",

		schema: z.object({
			expression: z
				.string()
				.describe("A expressão aritmética a ser calculada"),
		}),
	},
);

const searchNotes = tool(
	async ({ query }) => {
		console.log("[TOOL] search_notes:", query);
		const retriever = await getRetriever();
		const docs = await retriever.invoke(query);
		return docs.map((d) => d.pageContent).join("\n\n");
	},
	{
		name: "search_notes",
		description:
			"Busca informações nos documentos internos da empresa Nimbus Robotics: " +
			"políticas de RH, preços de produtos e informações do escritório.",
		schema: z.object({
			query: z.string().describe("O que buscar nos documentos"),
		}),
	},
);

const tools = [calculator, searchNotes];
const llmWithTools = llm.bindTools(tools);

const systemPrompt = new SystemMessage(
    "Você é um assistente com acesso a ferramentas. " +
    "Se precisar de um número que não conhece, use search_notes primeiro." +
    "SEMPRE use a ferramenta calculator para QUALQUER operação aritmética." +
	"Responda em texto simples. Não use LaTeX nem notação matemática — escreva números normalmente."
  );


  async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await llmWithTools.invoke([systemPrompt, ...state.messages]);
    return { messages: [response] };
  }

const graph = new StateGraph(MessagesAnnotation)
	.addNode("agent", callModel)
	.addNode("tools", new ToolNode(tools))
	.addEdge(START, "agent")
	.addConditionalEdges("agent", toolsCondition, ["tools", END])
	.addEdge("tools", "agent");


const checkpointer = new MemorySaver();
export const agentGraph = graph.compile({checkpointer});

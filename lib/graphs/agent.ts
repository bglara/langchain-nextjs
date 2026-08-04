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
 * Recursive-descent parser: understands ONLY numbers, + - * / and parentheses.
 * Any other character is rejected before any processing happens.
 * Nothing here executes code — it just walks the string and does arithmetic.
 */
function evaluateExpression(input: string): number {
	const text = input.replace(/\s+/g, "");

	// First line of defense: character allow-list.
	if (!/^[0-9+\-*/().]+$/.test(text)) {
		throw new Error("The expression contains disallowed characters.");
	}

	let pos = 0;

	// expression := term (('+' | '-') term)*
	function expression(): number {
		let value = term();
		while (
			pos < text.length &&
			(text[pos] === "+" || text[pos] === "-")
		) {
			const op = text[pos++];
			const right = term();
			value = op === "+" ? value + right : value - right;
		}
		return value;
	}

	// term := factor (('*' | '/') factor)*    ← multiplication before addition
	function term(): number {
		let value = factor();
		while (
			pos < text.length &&
			(text[pos] === "*" || text[pos] === "/")
		) {
			const op = text[pos++];
			const right = factor();
			if (op === "/" && right === 0)
				throw new Error("Division by zero.");
			value = op === "*" ? value * right : value / right;
		}
		return value;
	}

	// factor := number | '(' expression ')' | '-' factor
	function factor(): number {
		if (text[pos] === "(") {
			pos++;
			const value = expression();
			if (text[pos] !== ")") throw new Error("Unclosed parenthesis.");
			pos++;
			return value;
		}

		if (text[pos] === "-") {
			pos++;
			return -factor();
		}

		const start = pos;
		while (pos < text.length && /[0-9.]/.test(text[pos])) pos++;
		if (start === pos) throw new Error("Expected a number.");
		return parseFloat(text.slice(start, pos));
	}

	const result = expression();
	if (pos !== text.length) throw new Error("Invalid expression.");
	return result;
}

const calculator = tool(
	async ({ expression }) => {
		console.log("[TOOL] calculator:", expression);
		try {
			return String(evaluateExpression(expression));
		} catch (error) {
			// Return the error as text instead of throwing: this way the model
			// sees what went wrong and can try to fix the expression.
			return `Calculation error: ${(error as Error).message}`;
		}
	},
	{
		name: "calculator",
		description:
			"Evaluates a simple arithmetic expression, like '12 * 4 + 1'. " +
			"Accepts only numbers, + - * / and parentheses.",

		schema: z.object({
			expression: z
				.string()
				.describe("The arithmetic expression to calculate"),
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
			"Searches Nimbus Robotics' internal documents: " +
			"HR policies, product pricing, and office information.",
		schema: z.object({
			query: z.string().describe("What to search for in the documents"),
		}),
	},
);

const tools = [calculator, searchNotes];
const llmWithTools = llm.bindTools(tools);

const systemPrompt = new SystemMessage(
    "You are an assistant with access to tools. " +
    "If you need a number you don't already know, use search_notes first." +
    "ALWAYS use the calculator tool for ANY arithmetic operation." +
	"Respond in plain text. Do not use LaTeX or mathematical notation — write numbers normally."
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

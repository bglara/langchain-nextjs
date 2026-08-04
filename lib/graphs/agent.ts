import { StateGraph, START, END, MessagesAnnotation } from "@langchain/langgraph";
import { llm } from "@/lib/llm";

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addEdge("agent", END);

export const agentGraph = graph.compile();
